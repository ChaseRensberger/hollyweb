import { and, asc, desc, eq, gt, gte, lte } from "drizzle-orm";
import {
  cutoff,
  importInput,
  leagueInput,
  leagueUpdate,
  randomized,
  releaseTime,
  releaseSeason,
  snakeIndex,
  type MovieInput,
} from "../shared/rules";
import type { Store } from "./db";
import {
  drafts,
  events,
  grossReports,
  imports,
  invites,
  leagues,
  movies,
  movieRevisions,
  picks,
  queues,
  rosters,
  teams,
  trades,
  type Score,
} from "./db/schema";
import { hash } from "./auth";

type League = typeof leagues.$inferSelect;
type Movie = typeof movies.$inferSelect;
type Draft = typeof drafts.$inferSelect;
type Trade = typeof trades.$inferSelect;
const week = 7 * 24 * 60 * 60 * 1000;
export class RuleError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: 400 | 403 | 404 | 409 = 409,
  ) {
    super(message);
  }
}
function requireRule(
  condition: unknown,
  code: string,
  message: string,
  status: 400 | 403 | 404 | 409 = 409,
): asserts condition {
  if (!condition) throw new RuleError(code, message, status);
}

export class HollyDraft {
  readonly db: Store["db"];
  constructor(
    readonly store: Store,
    readonly now: () => number = Date.now,
  ) {
    this.db = store.db;
  }
  atomic<T>(operation: () => T): T {
    return this.store.sqlite.transaction(operation).immediate();
  }
  event(leagueID: string, type: string, data: unknown) {
    this.db.insert(events).values({ leagueID, type, data, createdAt: this.now() }).run();
  }
  league(id: string) {
    const league = this.db.select().from(leagues).where(eq(leagues.id, id)).get();
    requireRule(league, "NOT_FOUND", "League not found.", 404);
    return league;
  }
  member(leagueID: string, userID: string) {
    const team = this.db
      .select()
      .from(teams)
      .where(and(eq(teams.leagueID, leagueID), eq(teams.userID, userID)))
      .get();
    requireRule(team, "NOT_FOUND", "League not found.", 404);
    return team;
  }
  commissioner(leagueID: string, userID: string) {
    this.member(leagueID, userID);
    const league = this.league(leagueID);
    requireRule(
      league.commissionerID === userID,
      "COMMISSIONER_REQUIRED",
      "Only the commissioner can do this.",
      403,
    );
    return league;
  }
  movie(id: string) {
    const movie = this.db.select().from(movies).where(eq(movies.id, id)).get();
    requireRule(movie, "NOT_FOUND", "Movie not found.", 404);
    return movie;
  }
  movieState(movie: Movie, season = releaseSeason(movie)) {
    const release = releaseTime(movie.releaseDate);
    const locked =
      movie.lockedAt !== null ||
      movie.releaseStatus === "released" ||
      (release !== null && release <= this.now() && movie.releaseStatus !== "canceled");
    const seasonEligible =
      movie.releaseStatus !== "canceled" && movie.releaseDate?.startsWith(`${season}-`) === true;
    const reason =
      movie.releaseStatus === "canceled"
        ? "canceled"
        : !movie.releaseDate
          ? "missing_release_date"
          : !seasonEligible
            ? "outside_season"
            : locked
              ? "released"
              : !movie.poster || movie.poster.kind === "logo"
                ? "missing_poster"
                : null;
    return {
      eligibilitySeason: season,
      locked,
      seasonEligible,
      draftable: reason === null,
      reason,
      lockAt: movie.lockedAt ?? release,
    };
  }
  catalog(
    input: {
      season?: number;
      search?: string;
      candidates?: boolean;
      offset?: number;
      limit?: number;
    } = {},
  ) {
    const rows = this.db
      .select()
      .from(movies)
      .orderBy(asc(movies.rank), asc(movies.id))
      .all()
      .filter(
        (movie) =>
          (!input.season || releaseSeason(movie) === input.season) &&
          (!input.search ||
            `${movie.title} ${movie.studio}`.toLowerCase().includes(input.search.toLowerCase())),
      )
      .map((movie) => ({ ...movie, ...this.movieState(movie) }))
      .filter((movie) => input.candidates || (movie.poster && movie.poster.kind !== "logo"));
    const offset = input.offset ?? 0;
    return {
      total: rows.length,
      draftable: rows.filter((movie) => movie.draftable).length,
      movies: rows.slice(offset, offset + (input.limit ?? 100)),
    };
  }
  movieDetail(id: string) {
    const movie = this.movie(id);
    return {
      ...movie,
      ...this.movieState(movie),
      reports: this.db
        .select()
        .from(grossReports)
        .where(eq(grossReports.movieID, id))
        .orderBy(desc(grossReports.through), desc(grossReports.observedAt), desc(grossReports.id))
        .limit(100)
        .all(),
      history: this.db
        .select()
        .from(movieRevisions)
        .where(eq(movieRevisions.movieID, id))
        .orderBy(desc(movieRevisions.id))
        .limit(100)
        .all(),
    };
  }
  importData(raw: unknown, preview = false) {
    const input = importInput.parse(raw);
    const fingerprint = hash(JSON.stringify(input));
    const previous = this.db.select().from(imports).where(eq(imports.hash, fingerprint)).get();
    if (previous) return { duplicate: true, ...previous };
    // A rollback marker runs the same validation for preview as for a real import.
    const previewResult = { movies: input.movies.length, grosses: input.grosses.length };
    const marker = new Error("Import preview rollback");
    try {
      return this.atomic(() => {
        let reportsAdded = 0;
        for (const record of input.movies) {
          const { correctionReason, ...item } = record;
          const researchedAt = Date.parse(item.researchedAt);
          requireRule(
            researchedAt <= this.now(),
            "FUTURE_RESEARCH",
            "Research timestamps cannot be in the future.",
            400,
          );
          const old = this.db.select().from(movies).where(eq(movies.id, item.id)).get();
          requireRule(
            !old || researchedAt >= old.researchedAt,
            "STALE_RESEARCH",
            "A catalog import cannot replace newer research.",
          );
          requireRule(
            !old?.lockedAt ||
              correctionReason ||
              (old.releaseDate === item.releaseDate && item.releaseStatus !== "canceled"),
            "LOCKED_RELEASE",
            "A recorded release correction requires correctionReason.",
          );
          const release = releaseTime(item.releaseDate);
          requireRule(
            item.releaseStatus !== "released" || (release !== null && release <= this.now()),
            "INVALID_RELEASE",
            "A released movie needs a past release date.",
            400,
          );
          const calculatedLock =
            release !== null && release <= this.now() && item.releaseStatus !== "canceled"
              ? release
              : null;
          const values = {
            ...item,
            researchedAt,
            lockedAt: correctionReason ? calculatedLock : (old?.lockedAt ?? calculatedLock),
          };
          const changed =
            !old ||
            Object.entries(values).some(
              ([key, value]) => JSON.stringify(old[key as keyof Movie]) !== JSON.stringify(value),
            );
          this.db
            .insert(movies)
            .values(values)
            .onConflictDoUpdate({ target: movies.id, set: values })
            .run();
          if (changed)
            this.db
              .insert(movieRevisions)
              .values({ movieID: item.id, data: record, importedAt: this.now() })
              .run();
          if (old && changed) {
            for (const row of this.db
              .select()
              .from(rosters)
              .where(eq(rosters.movieID, item.id))
              .all()) {
              this.event(row.leagueID, "movie.updated", {
                movieID: item.id,
                releaseDate: item.releaseDate,
                correctionReason,
              });
            }
          }
          if (!old?.lockedAt && values.lockedAt !== null) this.lockEvents(item.id, values.lockedAt);
        }
        for (const report of input.grosses) {
          const movie = this.movie(report.movieID);
          const observedAt = Date.parse(report.observedAt);
          requireRule(
            observedAt <= this.now() && report.through <= report.observedAt.slice(0, 10),
            "FUTURE_REPORT",
            "Reports cannot describe future earnings.",
            400,
          );
          requireRule(
            movie.releaseDate &&
              report.through >= movie.releaseDate &&
              this.movieState(movie).locked,
            "UNRELEASED_GROSS",
            "Gross reports require a released movie.",
            400,
          );
          const reportHash = hash(JSON.stringify(report));
          if (this.db.select().from(grossReports).where(eq(grossReports.hash, reportHash)).get())
            continue;
          this.db
            .insert(grossReports)
            .values({ ...report, observedAt, hash: reportHash })
            .run();
          reportsAdded++;
          for (const row of this.db
            .select()
            .from(rosters)
            .where(eq(rosters.movieID, report.movieID))
            .all()) {
            this.event(row.leagueID, "gross.updated", {
              movieID: report.movieID,
              amount: report.amount,
              through: report.through,
            });
          }
        }
        this.expireTrades();
        const summary = { movies: input.movies.length, grosses: reportsAdded };
        this.db
          .insert(imports)
          .values({ hash: fingerprint, importedAt: this.now(), summary })
          .run();
        if (preview) throw marker;
        return { duplicate: false, hash: fingerprint, summary };
      });
    } catch (error) {
      if (error === marker) return { preview: true, summary: previewResult };
      throw error;
    }
  }
  createLeague(userID: string, raw: unknown) {
    const input = leagueInput.parse(raw);
    requireRule(this.now() < cutoff(input.season), "SEASON_ENDED", "This season has ended.", 400);
    return this.atomic(() => {
      const id = crypto.randomUUID();
      const { teamName, ...values } = input;
      this.db
        .insert(leagues)
        .values({ ...values, id, commissionerID: userID, createdAt: this.now() })
        .run();
      this.db
        .insert(teams)
        .values({
          id: crypto.randomUUID(),
          leagueID: id,
          userID,
          name: teamName,
          joinedAt: this.now(),
        })
        .run();
      this.event(id, "league.created", { name: input.name });
      return this.league(id);
    });
  }
  myLeagues(userID: string) {
    return this.db
      .select({ league: leagues, team: teams })
      .from(teams)
      .innerJoin(leagues, eq(teams.leagueID, leagues.id))
      .where(eq(teams.userID, userID))
      .all();
  }
  details(id: string, userID: string) {
    const me = this.member(id, userID);
    return {
      league: this.league(id),
      me,
      teams: this.db
        .select()
        .from(teams)
        .where(eq(teams.leagueID, id))
        .orderBy(asc(teams.joinedAt), asc(teams.id))
        .all(),
      cutoff: cutoff(this.league(id).season),
    };
  }
  editLeague(id: string, userID: string, raw: unknown) {
    const input = leagueUpdate.parse(raw);
    return this.atomic(() => {
      const league = this.commissioner(id, userID);
      requireRule(
        league.state === "lobby",
        "LEAGUE_STARTED",
        "League rules are fixed after the draft starts.",
      );
      const count = this.db.select().from(teams).where(eq(teams.leagueID, id)).all().length;
      requireRule(
        !input.capacity || input.capacity >= count,
        "LEAGUE_FULL",
        "Capacity cannot be smaller than the current membership.",
      );
      if (Object.keys(input).length)
        this.db.update(leagues).set(input).where(eq(leagues.id, id)).run();
      this.event(id, "league.updated", input);
      return this.league(id);
    });
  }
  invite(id: string, userID: string) {
    return this.atomic(() => {
      const league = this.commissioner(id, userID);
      requireRule(
        league.state === "lobby",
        "LEAGUE_STARTED",
        "Invites close when the draft starts.",
      );
      this.db.delete(invites).where(eq(invites.leagueID, id)).run();
      const token = crypto.randomUUID() + crypto.randomUUID();
      const expiresAt = this.now() + week;
      this.db
        .insert(invites)
        .values({ hash: hash(token), leagueID: id, expiresAt })
        .run();
      return { token, expiresAt };
    });
  }
  revokeInvite(id: string, userID: string) {
    this.commissioner(id, userID);
    this.db.delete(invites).where(eq(invites.leagueID, id)).run();
  }
  invitePreview(token: string) {
    const invite = this.db
      .select()
      .from(invites)
      .where(eq(invites.hash, hash(token)))
      .get();
    requireRule(
      invite && invite.expiresAt > this.now(),
      "INVITE_UNAVAILABLE",
      "Invite expired or is unavailable.",
      404,
    );
    const league = this.league(invite.leagueID);
    requireRule(league.state === "lobby", "INVITE_UNAVAILABLE", "This league has started.", 409);
    return {
      leagueID: league.id,
      name: league.name,
      season: league.season,
      capacity: league.capacity,
      slots: league.slots,
      expiresAt: invite.expiresAt,
    };
  }
  join(token: string, userID: string, name: string) {
    return this.atomic(() => {
      const invite = this.invitePreview(token);
      const existing = this.db
        .select()
        .from(teams)
        .where(and(eq(teams.leagueID, invite.leagueID), eq(teams.userID, userID)))
        .get();
      if (existing) return existing;
      requireRule(
        this.db.select().from(teams).where(eq(teams.leagueID, invite.leagueID)).all().length <
          invite.capacity,
        "LEAGUE_FULL",
        "The league is full.",
      );
      const team = {
        id: crypto.randomUUID(),
        leagueID: invite.leagueID,
        userID,
        name,
        joinedAt: this.now(),
      };
      this.db.insert(teams).values(team).run();
      this.event(invite.leagueID, "member.joined", { teamID: team.id, name });
      return team;
    });
  }
  rename(id: string, userID: string, name: string) {
    const team = this.member(id, userID);
    this.db.update(teams).set({ name }).where(eq(teams.id, team.id)).run();
    return { ...team, name };
  }
  removeMember(id: string, userID: string, teamID: string) {
    this.atomic(() => {
      const league = this.commissioner(id, userID);
      requireRule(
        league.state === "lobby",
        "LEAGUE_STARTED",
        "Membership is fixed after the draft starts.",
      );
      const team = this.db
        .select()
        .from(teams)
        .where(and(eq(teams.id, teamID), eq(teams.leagueID, id)))
        .get();
      requireRule(
        team && team.userID !== userID,
        "INVALID_MEMBER",
        "Select another member of this league.",
        400,
      );
      this.db.delete(teams).where(eq(teams.id, teamID)).run();
      this.event(id, "member.removed", { teamID });
    });
  }
  draft(id: string) {
    const draft = this.db.select().from(drafts).where(eq(drafts.leagueID, id)).get();
    requireRule(draft, "DRAFT_NOT_STARTED", "The draft has not started.", 404);
    return draft;
  }
  draftState(id: string, userID: string) {
    this.member(id, userID);
    const draft = this.draft(id);
    const league = this.league(id);
    return {
      ...draft,
      serverTime: this.now(),
      currentTeamID:
        league.state === "drafting"
          ? draft.order[snakeIndex(draft.nextPick, league.capacity)]
          : null,
      picks: this.db
        .select()
        .from(picks)
        .where(eq(picks.leagueID, id))
        .orderBy(asc(picks.overall))
        .all(),
    };
  }
  startDraft(id: string, userID: string) {
    return this.atomic(() => {
      const league = this.commissioner(id, userID);
      requireRule(
        league.state === "lobby",
        "DRAFT_ALREADY_STARTED",
        "The draft has already started.",
      );
      requireRule(
        this.now() < Date.UTC(league.season + 1, 0, 1),
        "SEASON_ENDED",
        "Drafts close at the end of the season year.",
      );
      const members = this.db.select().from(teams).where(eq(teams.leagueID, id)).all();
      requireRule(
        members.length === league.capacity,
        "MISSING_MANAGERS",
        "Fill all manager slots before the draft.",
      );
      const pool = this.db
        .select()
        .from(movies)
        .orderBy(asc(movies.rank), asc(movies.id))
        .all()
        .filter((movie) => this.movieState(movie, league.season).draftable)
        .map((movie) => movie.id);
      requireRule(
        pool.length >= league.capacity * league.slots,
        "INSUFFICIENT_MOVIES",
        "The eligible pool cannot fill all rosters.",
      );
      this.db
        .insert(drafts)
        .values({
          leagueID: id,
          order: randomized(members.map((team) => team.id)),
          pool,
          deadline: this.now() + league.pickSeconds * 1000,
          remaining: league.pickSeconds * 1000,
        })
        .run();
      this.db.update(leagues).set({ state: "drafting" }).where(eq(leagues.id, id)).run();
      this.db.delete(invites).where(eq(invites.leagueID, id)).run();
      this.event(id, "draft.started", this.draft(id));
      return this.draftState(id, userID);
    });
  }
  available(league: League, draft: Draft) {
    const selected = new Set(
      this.db
        .select()
        .from(picks)
        .where(eq(picks.leagueID, league.id))
        .all()
        .map((pick) => pick.movieID),
    );
    const catalog = new Map(
      this.db
        .select()
        .from(movies)
        .all()
        .map((movie) => [movie.id, movie]),
    );
    return draft.pool.filter(
      (id) =>
        !selected.has(id) &&
        catalog.has(id) &&
        this.movieState(catalog.get(id)!, league.season).draftable,
    );
  }
  private makePick(league: League, draft: Draft, movieID: string, automatic: boolean) {
    const teamID = draft.order[snakeIndex(draft.nextPick, league.capacity)]!;
    const pick = {
      id: crypto.randomUUID(),
      leagueID: league.id,
      teamID,
      movieID,
      overall: draft.nextPick,
      automatic,
      createdAt: this.now(),
    };
    this.db.insert(picks).values(pick).run();
    this.db
      .insert(rosters)
      .values({ id: crypto.randomUUID(), leagueID: league.id, teamID, movieID })
      .run();
    const complete = draft.nextPick === league.capacity * league.slots;
    this.db
      .update(drafts)
      .set({
        nextPick: draft.nextPick + 1,
        deadline: complete ? null : this.now() + league.pickSeconds * 1000,
        remaining: league.pickSeconds * 1000,
      })
      .where(eq(drafts.leagueID, league.id))
      .run();
    this.event(league.id, "draft.picked", {
      ...pick,
      deadline: complete ? null : this.now() + league.pickSeconds * 1000,
    });
    if (complete) {
      this.db.update(leagues).set({ state: "active" }).where(eq(leagues.id, league.id)).run();
      this.event(league.id, "draft.completed", {});
    }
    return pick;
  }
  pick(id: string, userID: string, movieID: string, expectedPick: number) {
    // Resolve an expired deadline before the manual transaction. A rejection must not undo an automatic pick.
    this.member(id, userID);
    this.tickDraft(id);
    return this.atomic(() => {
      const team = this.member(id, userID);
      const league = this.league(id);
      const draft = this.draft(id);
      requireRule(
        league.state === "drafting" && !draft.paused,
        "DRAFT_NOT_LIVE",
        "The draft is not live.",
      );
      requireRule(draft.nextPick === expectedPick, "STALE_PICK", "The current pick has changed.");
      requireRule(
        draft.deadline !== null && draft.deadline > this.now(),
        "PICK_EXPIRED",
        "This pick has expired. Reload the draft.",
      );
      requireRule(
        draft.order[snakeIndex(draft.nextPick, league.capacity)] === team.id,
        "NOT_YOUR_TURN",
        "It is not your turn.",
        403,
      );
      requireRule(
        this.available(league, draft).includes(movieID),
        "MOVIE_UNAVAILABLE",
        "This movie is not available.",
      );
      return this.makePick(league, draft, movieID, false);
    });
  }
  pause(id: string, userID: string, resume: boolean) {
    this.commissioner(id, userID);
    this.tickDraft(id);
    return this.atomic(() => {
      const league = this.commissioner(id, userID);
      const draft = this.draft(id);
      requireRule(league.state === "drafting", "DRAFT_NOT_LIVE", "The draft is not live.");
      requireRule(
        draft.paused === resume,
        "DRAFT_STATE",
        resume ? "The draft is not paused." : "The draft is already paused.",
      );
      if (resume)
        requireRule(
          this.available(league, draft).length >=
            league.capacity * league.slots - draft.nextPick + 1,
          "INSUFFICIENT_MOVIES",
          "The draft pool cannot fill the remaining slots.",
        );
      this.db
        .update(drafts)
        .set(
          resume
            ? {
                paused: false,
                pauseReason: null,
                deadline: this.now() + Math.max(1000, draft.remaining),
              }
            : {
                paused: true,
                pauseReason: "commissioner",
                deadline: null,
                remaining: Math.max(0, (draft.deadline ?? this.now()) - this.now()),
              },
        )
        .where(eq(drafts.leagueID, id))
        .run();
      this.event(id, resume ? "draft.resumed" : "draft.paused", this.draft(id));
      return this.draftState(id, userID);
    });
  }
  getQueue(id: string, userID: string) {
    const team = this.member(id, userID);
    return this.db.select().from(queues).where(eq(queues.teamID, team.id)).get()?.movies ?? [];
  }
  setQueue(id: string, userID: string, ids: string[]) {
    return this.atomic(() => {
      const team = this.member(id, userID);
      const league = this.league(id);
      requireRule(
        ["lobby", "drafting"].includes(league.state),
        "DRAFT_COMPLETED",
        "The draft has completed.",
      );
      requireRule(
        new Set(ids).size === ids.length &&
          ids.every((id) => this.movieState(this.movie(id), league.season).draftable),
        "INVALID_QUEUE",
        "Queue entries must be unique eligible movies.",
        400,
      );
      this.db
        .insert(queues)
        .values({ teamID: team.id, movies: ids })
        .onConflictDoUpdate({ target: queues.teamID, set: { movies: ids } })
        .run();
      return ids;
    });
  }
  tickDraft(id: string) {
    this.atomic(() => {
      const league = this.league(id);
      if (league.state !== "drafting") return;
      const draft = this.draft(id);
      if (draft.paused) return;
      const available = this.available(league, draft);
      if (available.length < league.capacity * league.slots - draft.nextPick + 1) {
        this.db
          .update(drafts)
          .set({
            paused: true,
            pauseReason: "insufficient_movies",
            remaining: Math.max(1000, (draft.deadline ?? this.now()) - this.now()),
            deadline: null,
          })
          .where(eq(drafts.leagueID, id))
          .run();
        this.event(id, "draft.paused", { reason: "insufficient_movies" });
        return;
      }
      if (draft.deadline === null || draft.deadline > this.now()) return;
      const teamID = draft.order[snakeIndex(draft.nextPick, league.capacity)]!;
      const queue =
        this.db.select().from(queues).where(eq(queues.teamID, teamID)).get()?.movies ?? [];
      const selection = queue.find((movieID) => available.includes(movieID)) ?? available[0]!;
      this.makePick(league, draft, selection, true);
    });
  }
  roster(id: string, userID: string) {
    this.member(id, userID);
    const league = this.league(id);
    return this.db
      .select({ teamID: rosters.teamID, movie: movies })
      .from(rosters)
      .innerJoin(movies, eq(rosters.movieID, movies.id))
      .where(eq(rosters.leagueID, id))
      .all()
      .map((row) => ({ ...row, ...this.movieState(row.movie, league.season) }));
  }
  private tradeable(league: League, teamID: string, ids: string[]) {
    if (league.state !== "active" || this.now() >= cutoff(league.season)) return false;
    const owned = new Set(
      this.db
        .select()
        .from(rosters)
        .where(and(eq(rosters.leagueID, league.id), eq(rosters.teamID, teamID)))
        .all()
        .map((row) => row.movieID),
    );
    return ids.every((id) => {
      if (!owned.has(id)) return false;
      const state = this.movieState(this.movie(id), league.season);
      return state.seasonEligible && !state.locked;
    });
  }
  propose(id: string, userID: string, recipientID: string, give: string[], receive: string[]) {
    return this.atomic(() => {
      const team = this.member(id, userID);
      const league = this.league(id);
      const recipient = this.db
        .select()
        .from(teams)
        .where(and(eq(teams.id, recipientID), eq(teams.leagueID, id)))
        .get();
      requireRule(
        recipient && recipient.id !== team.id,
        "INVALID_RECIPIENT",
        "Select another team in this league.",
        400,
      );
      requireRule(
        give.length > 0 &&
          give.length === receive.length &&
          new Set([...give, ...receive]).size === give.length + receive.length,
        "INVALID_TRADE",
        "Trades require equal counts of distinct movies.",
        400,
      );
      requireRule(
        this.tradeable(league, team.id, give) && this.tradeable(league, recipientID, receive),
        "MOVIE_UNAVAILABLE",
        "Only owned, eligible, unreleased movies can be traded.",
      );
      const trade = {
        id: crypto.randomUUID(),
        leagueID: id,
        senderID: team.id,
        recipientID,
        give,
        receive,
        createdAt: this.now(),
        expiresAt: Math.min(this.now() + week, cutoff(league.season)),
      };
      this.db.insert(trades).values(trade).run();
      this.event(id, "trade.proposed", trade);
      return this.db.select().from(trades).where(eq(trades.id, trade.id)).get()!;
    });
  }
  private resolveTrade(trade: Trade, state: string) {
    this.db
      .update(trades)
      .set({ state, resolvedAt: this.now() })
      .where(eq(trades.id, trade.id))
      .run();
    this.event(trade.leagueID, `trade.${state}`, { tradeID: trade.id });
  }
  expireTrades() {
    for (const trade of this.db.select().from(trades).where(eq(trades.state, "pending")).all()) {
      const league = this.league(trade.leagueID);
      if (trade.expiresAt <= this.now()) this.resolveTrade(trade, "expired");
      else if (
        !this.tradeable(league, trade.senderID, trade.give) ||
        !this.tradeable(league, trade.recipientID, trade.receive)
      )
        this.resolveTrade(trade, "invalidated");
    }
  }
  listTrades(id: string, userID: string) {
    this.member(id, userID);
    this.atomic(() => this.expireTrades());
    return this.db
      .select()
      .from(trades)
      .where(eq(trades.leagueID, id))
      .orderBy(desc(trades.createdAt))
      .limit(100)
      .all();
  }
  resolve(id: string, userID: string, tradeID: string, action: "accept" | "reject" | "cancel") {
    this.member(id, userID);
    this.atomic(() => this.expireTrades());
    return this.atomic(() => {
      const team = this.member(id, userID);
      const league = this.league(id);
      const trade = this.db
        .select()
        .from(trades)
        .where(and(eq(trades.id, tradeID), eq(trades.leagueID, id)))
        .get();
      requireRule(trade, "NOT_FOUND", "Trade not found.", 404);
      requireRule(
        (action === "cancel" ? trade.senderID : trade.recipientID) === team.id,
        "TRADE_PERMISSION",
        "This team cannot resolve the offer.",
        403,
      );
      requireRule(
        trade.state === "pending" && trade.expiresAt > this.now(),
        "TRADE_CLOSED",
        "The offer is no longer open.",
      );
      if (action === "accept") {
        requireRule(
          this.tradeable(league, trade.senderID, trade.give) &&
            this.tradeable(league, trade.recipientID, trade.receive),
          "MOVIE_UNAVAILABLE",
          "The offer contains an unavailable movie.",
        );
        for (const movieID of trade.give)
          this.db
            .update(rosters)
            .set({ teamID: trade.recipientID })
            .where(and(eq(rosters.leagueID, id), eq(rosters.movieID, movieID)))
            .run();
        for (const movieID of trade.receive)
          this.db
            .update(rosters)
            .set({ teamID: trade.senderID })
            .where(and(eq(rosters.leagueID, id), eq(rosters.movieID, movieID)))
            .run();
      }
      this.resolveTrade(
        trade,
        action === "accept" ? "accepted" : action === "reject" ? "rejected" : "canceled",
      );
      this.expireTrades();
      return this.db.select().from(trades).where(eq(trades.id, tradeID)).get()!;
    });
  }
  standings(id: string, userID: string) {
    this.member(id, userID);
    const league = this.league(id);
    if (league.finalScores)
      return { finalized: true, scores: league.finalScores, cutoff: cutoff(league.season) };
    const lastDate = new Date(Math.min(this.now(), cutoff(league.season) - 1))
      .toISOString()
      .slice(0, 10);
    const scores: Score[] = this.db
      .select()
      .from(teams)
      .where(eq(teams.leagueID, id))
      .all()
      .map((team) => {
        let dollars = 0;
        let missing = 0;
        for (const entry of this.db
          .select()
          .from(rosters)
          .where(eq(rosters.teamID, team.id))
          .all()) {
          const movie = this.movie(entry.movieID);
          const state = this.movieState(movie, league.season);
          if (!state.seasonEligible || !state.locked || !movie.releaseDate) continue;
          const report = this.db
            .select()
            .from(grossReports)
            .where(
              and(
                eq(grossReports.movieID, movie.id),
                gte(grossReports.through, movie.releaseDate),
                lte(grossReports.through, lastDate),
              ),
            )
            .orderBy(
              desc(grossReports.through),
              desc(grossReports.observedAt),
              desc(grossReports.id),
            )
            .get();
          if (report) dollars += report.amount;
          else missing++;
        }
        return {
          teamID: team.id,
          name: team.name,
          dollars,
          points: dollars / 1_000_000,
          missing,
          rank: 0,
        };
      })
      .sort((a, b) => b.dollars - a.dollars || a.teamID.localeCompare(b.teamID));
    for (let i = 0; i < scores.length; i++)
      scores[i]!.rank =
        i > 0 && scores[i]!.dollars === scores[i - 1]!.dollars ? scores[i - 1]!.rank : i + 1;
    return { finalized: false, scores, cutoff: cutoff(league.season) };
  }
  finalize(id: string, userID: string, acknowledgeMissing: boolean) {
    return this.atomic(() => {
      const league = this.commissioner(id, userID);
      requireRule(
        league.state === "active" && this.now() >= cutoff(league.season),
        "SEASON_NOT_COMPLETE",
        "Finalize an active season after its scoring cutoff.",
      );
      const standings = this.standings(id, userID);
      requireRule(
        acknowledgeMissing || standings.scores.every((score) => score.missing === 0),
        "MISSING_REPORTS",
        "Acknowledge missing gross reports before finalization.",
      );
      this.db
        .update(leagues)
        .set({ state: "finalized", finalScores: standings.scores })
        .where(eq(leagues.id, id))
        .run();
      this.expireTrades();
      this.event(id, "league.finalized", { scores: standings.scores });
      return this.standings(id, userID);
    });
  }
  activity(id: string, userID: string, after = 0, limit = 100) {
    this.member(id, userID);
    return this.db
      .select()
      .from(events)
      .where(and(eq(events.leagueID, id), gt(events.id, after)))
      .orderBy(asc(events.id))
      .limit(limit)
      .all();
  }
  private lockEvents(movieID: string, lockedAt: number) {
    for (const row of this.db.select().from(rosters).where(eq(rosters.movieID, movieID)).all())
      this.event(row.leagueID, "movie.locked", { movieID, teamID: row.teamID, lockedAt });
  }
  tick() {
    this.atomic(() => {
      for (const movie of this.db.select().from(movies).all()) {
        if (movie.lockedAt !== null || movie.releaseStatus === "canceled") continue;
        const release = releaseTime(movie.releaseDate);
        if (release === null || release > this.now()) continue;
        this.db.update(movies).set({ lockedAt: release }).where(eq(movies.id, movie.id)).run();
        this.lockEvents(movie.id, release);
      }
      this.expireTrades();
    });
    for (const league of this.db.select().from(leagues).where(eq(leagues.state, "drafting")).all())
      this.tickDraft(league.id);
  }
}

export type CatalogMovie = MovieInput;
