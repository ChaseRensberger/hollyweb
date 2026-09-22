import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { eq } from "drizzle-orm";
import { cutoff, snakeIndex, type MovieInput } from "../shared/rules";
import { openDatabase, type Store } from "./db";
import { movies, teams } from "./db/schema";
import { HollyDraft, RuleError } from "./service";

const stores: Store[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.sqlite.close();
});
const baseTime = Date.parse("2027-01-01T12:00:00Z");
function fixture(count = 12, path = ":memory:") {
  const store = openDatabase(path);
  stores.push(store);
  migrate(store.db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  let now = baseTime;
  const service = new HollyDraft(store, () => now);
  const catalog: MovieInput[] = Array.from({ length: count }, (_, index) => ({
    id: `movie-${index + 1}`,
    title: `Movie ${index + 1}`,
    studio: "Test Studio",
    season: 2027,
    rank: index + 1,
    releaseDate: "2027-06-01",
    releaseStatus: "scheduled",
    source: "https://example.com/release",
    researchedAt: new Date(baseTime - 1000).toISOString(),
    poster: {
      url: "https://example.com/poster.jpg",
      source: "https://example.com/poster",
      kind: "teaser",
    },
    imdbID: null,
    wikidataID: null,
  }));
  service.importData({ version: 1, movies: catalog });
  return {
    service,
    store,
    catalog,
    time: (value: number) => {
      now = value;
    },
    advance: (value: number) => {
      now += value;
    },
  };
}
function league(service: HollyDraft, capacity = 2, slots = 2) {
  const created = service.createLeague("owner", {
    name: "League",
    teamName: "Owner",
    season: 2027,
    capacity,
    slots,
    pickSeconds: 15,
  });
  const invite = service.invite(created.id, "owner");
  for (let i = 1; i < capacity; i++) service.join(invite.token, `user-${i}`, `Team ${i}`);
  return created.id;
}
function finishDraft(service: HollyDraft, id: string) {
  if (service.league(id).state === "lobby") service.startDraft(id, "owner");
  while (service.league(id).state === "drafting") {
    const state = service.draftState(id, "owner");
    const team = service.db.select().from(teams).where(eq(teams.id, state.currentTeamID!)).get()!;
    const movieID = service.available(service.league(id), service.draft(id))[0]!;
    service.pick(id, team.userID, movieID, state.nextPick);
  }
}
function expectRule(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(RuleError);
    expect((error as RuleError).code).toBe(code);
  }
}

describe("league membership", () => {
  test("invites enforce capacity, expiry, revocation, and membership privacy", () => {
    const { service, advance } = fixture();
    const id = league(service);
    const invitation = service.invite(id, "owner");
    expectRule(() => service.join(invitation.token, "intruder", "Extra"), "LEAGUE_FULL");
    expectRule(() => service.details(id, "intruder"), "NOT_FOUND");
    expectRule(() => service.editLeague(id, "user-1", { name: "Other" }), "COMMISSIONER_REQUIRED");
    service.removeMember(id, "owner", service.member(id, "user-1").id);
    expect(service.join(invitation.token, "new-user", "New").userID).toBe("new-user");
    service.revokeInvite(id, "owner");
    expectRule(() => service.invitePreview(invitation.token), "INVITE_UNAVAILABLE");
    const expiring = service.invite(id, "owner");
    advance(7 * 86400000);
    expectRule(() => service.invitePreview(expiring.token), "INVITE_UNAVAILABLE");
  });
  test("configuration and membership freeze at draft start", () => {
    const { service } = fixture();
    const id = league(service);
    service.editLeague(id, "owner", { slots: 3 });
    service.startDraft(id, "owner");
    expectRule(() => service.editLeague(id, "owner", { slots: 1 }), "LEAGUE_STARTED");
    expectRule(
      () => service.removeMember(id, "owner", service.member(id, "user-1").id),
      "LEAGUE_STARTED",
    );
    expect(service.rename(id, "user-1", "New name").name).toBe("New name");
  });
});

describe("snake draft", () => {
  test.each([2, 3, 8, 16])("fills configurable rosters for %i managers", (capacity) => {
    const { service } = fixture(capacity * 3);
    const id = league(service, capacity, 3);
    finishDraft(service, id);
    const state = service.draftState(id, "owner");
    expect(state.picks.map((pick) => pick.teamID)).toEqual([
      ...state.order,
      ...state.order.toReversed(),
      ...state.order,
    ]);
    expect(state.currentTeamID).toBeNull();
    expect(service.roster(id, "owner")).toHaveLength(capacity * 3);
    expect(new Set(state.picks.map((pick) => pick.movieID)).size).toBe(capacity * 3);
    expect(service.league(id).state).toBe("active");
  });
  test("requires enough real posters, current releases, and managers", () => {
    const { service, store } = fixture(4);
    const id = league(service);
    store.db.update(movies).set({ poster: null }).where(eq(movies.id, "movie-1")).run();
    expectRule(() => service.startDraft(id, "owner"), "INSUFFICIENT_MOVIES");
    expect(service.league(id).state).toBe("lobby");
    service.removeMember(id, "owner", service.member(id, "user-1").id);
    expectRule(() => service.startDraft(id, "owner"), "MISSING_MANAGERS");
  });
  test("rejects stale picks, duplicate movies, and wrong turns", () => {
    const { service } = fixture();
    const id = league(service);
    const state = service.startDraft(id, "owner");
    const current = service.db
      .select()
      .from(teams)
      .where(eq(teams.id, state.currentTeamID!))
      .get()!;
    const wrong = current.userID === "owner" ? "user-1" : "owner";
    expectRule(() => service.pick(id, wrong, "movie-1", 1), "NOT_YOUR_TURN");
    service.pick(id, current.userID, "movie-1", 1);
    expectRule(() => service.pick(id, current.userID, "movie-2", 1), "STALE_PICK");
    expectRule(() => service.pick(id, wrong, "movie-1", 2), "MOVIE_UNAVAILABLE");
    expect(service.draftState(id, "owner").picks).toHaveLength(1);
  });
  test("timeouts honor private queues, then fall back to catalog rank", () => {
    const { service, advance } = fixture();
    const id = league(service);
    service.setQueue(id, "owner", ["movie-7"]);
    service.setQueue(id, "user-1", ["movie-7"]);
    const state = service.startDraft(id, "owner");
    advance(15000);
    service.tick();
    expect(service.draftState(id, "owner").picks[0]!.movieID).toBe("movie-7");
    advance(15000);
    service.tick();
    const picks = service.draftState(id, "owner").picks;
    expect(picks[1]!.movieID).toBe("movie-1");
    expect(picks.every((pick) => pick.automatic)).toBe(true);
    expect(picks[0]!.teamID).toBe(state.order[0]!);
  });
  test("pause preserves remaining time and boundary requests cannot beat timeout", () => {
    const { service, advance } = fixture();
    const id = league(service);
    service.startDraft(id, "owner");
    advance(5000);
    service.pause(id, "owner", false);
    advance(100000);
    service.tick();
    expect(service.draft(id).nextPick).toBe(1);
    const resumed = service.pause(id, "owner", true);
    expect(resumed.deadline! - service.now()).toBe(10000);
    advance(10000);
    expectRule(() => service.pick(id, "owner", "movie-10", 1), "STALE_PICK");
    expect(service.draftState(id, "owner").picks[0]!.automatic).toBe(true);
  });
  test("release changes suspend an insufficient snapshotted pool", () => {
    const { service, catalog } = fixture(4);
    const id = league(service);
    service.startDraft(id, "owner");
    service.importData({ version: 1, movies: [{ ...catalog[0], releaseDate: "2028-06-01" }] });
    service.tick();
    expect(service.draft(id).pauseReason).toBe("insufficient_movies");
    expectRule(() => service.pause(id, "owner", true), "INSUFFICIENT_MOVIES");
    service.importData({
      version: 1,
      movies: [{ ...catalog[0], researchedAt: new Date(service.now()).toISOString() }],
    });
    service.pause(id, "owner", true);
    expect(service.draft(id).paused).toBe(false);
  });
  test("postponed movies have consistent catalog, detail, queue, and draft eligibility", () => {
    const { service, catalog } = fixture(2);
    service.importData({
      version: 1,
      movies: catalog.map((movie) => ({ ...movie, releaseDate: "2028-06-01" })),
    });
    expect(service.catalog({ season: 2027 }).movies).toHaveLength(0);
    const nextCatalog = service.catalog({ season: 2028 });
    expect(nextCatalog.draftable).toBe(2);
    expect(nextCatalog.movies.map((movie) => movie.id)).toEqual(["movie-1", "movie-2"]);
    expect(service.movieDetail("movie-1")).toMatchObject({
      season: 2027,
      eligibilitySeason: 2028,
      draftable: true,
    });
    const nextLeague = service.createLeague("owner", {
      name: "Next season",
      teamName: "Owner",
      season: 2028,
      capacity: 2,
      slots: 1,
    });
    service.join(service.invite(nextLeague.id, "owner").token, "user-1", "Other team");
    expect(service.setQueue(nextLeague.id, "owner", ["movie-1"])).toEqual(["movie-1"]);
    expect(service.startDraft(nextLeague.id, "owner").pool).toEqual(
      nextCatalog.movies.map((movie) => movie.id),
    );
  });
  test("candidates without release dates remain in their imported catalog season", () => {
    const { service, catalog } = fixture(1);
    service.importData({ version: 1, movies: [{ ...catalog[0], releaseDate: null }] });
    const candidate = service.catalog({ season: 2027, candidates: true }).movies[0]!;
    expect(candidate.reason).toBe("missing_release_date");
    expect(candidate.eligibilitySeason).toBe(2027);
    expect(candidate.draftable).toBe(false);
    expect(service.catalog({ season: 2028, candidates: true }).total).toBe(0);
  });
  test("restart preserves state and resolves only one overdue pick", () => {
    const folder = mkdtempSync(join(tmpdir(), "hollydraft-"));
    try {
      const f = fixture(12, join(folder, "game.sqlite"));
      const id = league(f.service);
      f.service.startDraft(id, "owner");
      f.store.sqlite.close();
      stores.splice(stores.indexOf(f.store), 1);
      const reopened = openDatabase(join(folder, "game.sqlite"));
      const service = new HollyDraft(reopened, () => baseTime + 3600000);
      try {
        service.tick();
        service.tick();
        expect(service.draft(id).nextPick).toBe(2);
        expect(service.draft(id).deadline).toBe(baseTime + 3600000 + 15000);
      } finally {
        reopened.sqlite.close();
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe("trades and release locks", () => {
  test("acceptance rejects expiry between the sweep and transfer transactions", () => {
    const { service, store, time, advance } = fixture();
    const id = league(service, 2, 1);
    finishDraft(service, id);
    const roster = service.roster(id, "owner");
    const sender = service.member(id, "owner");
    const recipient = service.member(id, "user-1");
    const trade = service.propose(
      id,
      "owner",
      recipient.id,
      [roster.find((row) => row.teamID === sender.id)!.movie.id],
      [roster.find((row) => row.teamID === recipient.id)!.movie.id],
    );
    time(trade.expiresAt - 1);
    class DelayedTransaction extends HollyDraft {
      override atomic<T>(operation: () => T): T {
        const result = super.atomic(operation);
        // Simulate time spent waiting between committed database transactions.
        advance(2);
        return result;
      }
    }
    const delayed = new DelayedTransaction(store, service.now);
    expectRule(() => delayed.resolve(id, "user-1", trade.id, "accept"), "TRADE_CLOSED");
    expect(service.roster(id, "owner")).toEqual(roster);
    expect(service.listTrades(id, "owner")[0]!.state).toBe("expired");
    expect(service.activity(id, "owner").some((event) => event.type === "trade.accepted")).toBe(
      false,
    );
  });
  test("acceptance swaps ownership atomically and invalidates competing offers", () => {
    const { service } = fixture();
    const id = league(service);
    finishDraft(service, id);
    const sender = service.member(id, "owner");
    const recipient = service.member(id, "user-1");
    const roster = service.roster(id, "owner");
    const give = roster
      .filter((entry) => entry.teamID === sender.id)
      .map((entry) => entry.movie.id);
    const receive = roster
      .filter((entry) => entry.teamID === recipient.id)
      .map((entry) => entry.movie.id);
    const trade = service.propose(id, "owner", recipient.id, give, receive);
    const other = service.propose(id, "owner", recipient.id, [give[0]!], [receive[0]!]);
    expectRule(() => service.resolve(id, "owner", trade.id, "accept"), "TRADE_PERMISSION");
    expect(service.resolve(id, "user-1", trade.id, "accept").state).toBe("accepted");
    expect(service.listTrades(id, "owner").find((entry) => entry.id === other.id)!.state).toBe(
      "invalidated",
    );
    expect(
      service
        .roster(id, "owner")
        .filter((entry) => entry.teamID === sender.id)
        .map((entry) => entry.movie.id)
        .sort(),
    ).toEqual(receive.sort());
    expectRule(() => service.resolve(id, "user-1", trade.id, "accept"), "TRADE_CLOSED");
  });
  test("release boundaries reject trades even before a background lock job", () => {
    const { service, time } = fixture();
    const id = league(service, 2, 1);
    finishDraft(service, id);
    const roster = service.roster(id, "owner");
    const sender = service.member(id, "owner");
    const recipient = service.member(id, "user-1");
    time(Date.parse("2027-05-31T23:59:59Z"));
    const trade = service.propose(
      id,
      "owner",
      recipient.id,
      [roster.find((r) => r.teamID === sender.id)!.movie.id],
      [roster.find((r) => r.teamID === recipient.id)!.movie.id],
    );
    time(Date.parse("2027-06-01T00:00:00Z"));
    expectRule(() => service.resolve(id, "user-1", trade.id, "accept"), "TRADE_CLOSED");
    service.tick();
    service.tick();
    expect(
      service.activity(id, "owner").filter((event) => event.type === "movie.locked"),
    ).toHaveLength(2);
  });
  test("trade rules reject different counts, other leagues, expired offers, and delayed films", () => {
    const { service, advance, catalog } = fixture();
    const id = league(service, 2, 1);
    const otherID = league(service, 2, 1);
    finishDraft(service, id);
    const roster = service.roster(id, "owner");
    const sender = service.member(id, "owner");
    const recipient = service.member(id, "user-1");
    const give = [roster.find((r) => r.teamID === sender.id)!.movie.id];
    const receive = [roster.find((r) => r.teamID === recipient.id)!.movie.id];
    expectRule(() => service.propose(id, "owner", recipient.id, give, []), "INVALID_TRADE");
    expectRule(
      () => service.propose(id, "owner", service.member(otherID, "user-1").id, give, receive),
      "INVALID_RECIPIENT",
    );
    const trade = service.propose(id, "owner", recipient.id, give, receive);
    advance(7 * 86400000);
    expectRule(() => service.resolve(id, "user-1", trade.id, "accept"), "TRADE_CLOSED");
    const affected = catalog.find((m) => m.id === give[0])!;
    service.importData({ version: 1, movies: [{ ...affected, releaseDate: "2028-02-01" }] });
    expectRule(
      () => service.propose(id, "owner", recipient.id, give, receive),
      "MOVIE_UNAVAILABLE",
    );
    expect(service.roster(id, "owner")).toHaveLength(2);
  });
});

describe("imports and scoring", () => {
  test("imports are idempotent, preview rolls back, invalid batches leave no partial writes", () => {
    const { service, catalog } = fixture();
    expect(service.importData({ version: 1, movies: catalog })).toHaveProperty("duplicate", true);
    const changed = { ...catalog[0], title: "New title" };
    service.importData({ version: 1, movies: [changed] }, true);
    expect(service.movie("movie-1").title).toBe("Movie 1");
    expectRule(
      () =>
        service.importData({
          version: 1,
          movies: [changed],
          grosses: [
            {
              movieID: "absent",
              amount: 10,
              through: "2027-01-01",
              observedAt: new Date(baseTime).toISOString(),
              source: "https://example.com/gross",
            },
          ],
        }),
      "NOT_FOUND",
    );
    expect(service.movie("movie-1").title).toBe("Movie 1");
  });
  test("cumulative reports, corrections, ties, cutoff, and frozen final scores", () => {
    const { service, time } = fixture();
    const id = league(service, 2, 1);
    finishDraft(service, id);
    time(Date.parse("2027-06-03T12:00:00Z"));
    service.tick();
    expect(service.standings(id, "owner").scores.map((s) => s.missing)).toEqual([1, 1]);
    const report = (movieID: string, amount: number, through: string, observedAt: string) => ({
      movieID,
      amount,
      through,
      observedAt,
      source: "https://example.com/gross",
    });
    service.importData({
      version: 1,
      grosses: [
        report("movie-1", 1000000, "2027-06-01", "2027-06-02T00:00:00Z"),
        report("movie-1", 3000000, "2027-06-02", "2027-06-03T00:00:00Z"),
        report("movie-2", 2000000, "2027-06-02", "2027-06-03T00:00:00Z"),
      ],
    });
    expect(service.standings(id, "owner").scores.map((s) => s.dollars)).toEqual([3000000, 2000000]);
    service.importData({
      version: 1,
      grosses: [
        {
          ...report("movie-1", 2000000, "2027-06-02", "2027-06-03T01:00:00Z"),
          reason: "Source correction",
        },
      ],
    });
    expect(service.standings(id, "owner").scores.map((s) => s.rank)).toEqual([1, 1]);
    expectRule(() => service.finalize(id, "owner", false), "SEASON_NOT_COMPLETE");
    time(cutoff(2027) + 86400000);
    service.importData({
      version: 1,
      grosses: [report("movie-1", 9000000, "2028-04-01", "2028-04-02T00:00:00Z")],
    });
    expect(service.standings(id, "owner").scores.map((s) => s.dollars)).toEqual([2000000, 2000000]);
    const final = service.finalize(id, "owner", false);
    service.importData({
      version: 1,
      grosses: [report("movie-1", 7000000, "2028-03-31", "2028-04-02T00:00:00Z")],
    });
    expect(service.standings(id, "owner")).toEqual(final);
  });
  test("delayed and canceled films retain roster slots but score zero", () => {
    const { service, catalog, time } = fixture();
    const id = league(service, 2, 1);
    finishDraft(service, id);
    service.importData({
      version: 1,
      movies: [
        { ...catalog[0], releaseDate: "2028-01-02" },
        { ...catalog[1], releaseStatus: "canceled" },
      ],
    });
    time(Date.parse("2028-03-01T00:00:00Z"));
    service.tick();
    service.importData({
      version: 1,
      grosses: [
        {
          movieID: "movie-1",
          amount: 100000000,
          through: "2028-02-29",
          observedAt: "2028-03-01T00:00:00Z",
          source: "https://example.com/gross",
        },
      ],
    });
    expect(
      service.standings(id, "owner").scores.every((s) => s.dollars === 0 && s.missing === 0),
    ).toBe(true);
    expect(service.roster(id, "owner")).toHaveLength(2);
  });
  test("release corrections exclude earlier gross reports but retain them in history", () => {
    const { service, time, catalog } = fixture(2);
    const id = league(service, 2, 1);
    finishDraft(service, id);
    time(Date.parse("2027-06-04T00:00:00Z"));
    service.tick();
    service.importData({
      version: 1,
      grosses: catalog.map((movie) => ({
        movieID: movie.id,
        amount: 10000000,
        through: "2027-06-02",
        observedAt: "2027-06-03T00:00:00Z",
        source: "https://example.com/gross",
      })),
    });
    const corrected = {
      ...catalog[0],
      releaseDate: "2027-06-03",
      researchedAt: "2027-06-04T00:00:00Z",
      correctionReason: "Correct the commercial opening date.",
    };
    service.importData({ version: 1, movies: [corrected] });
    const affectedTeam = service
      .roster(id, "owner")
      .find((row) => row.movie.id === "movie-1")!.teamID;
    const score = () =>
      service.standings(id, "owner").scores.find((row) => row.teamID === affectedTeam)!;
    expect(score()).toMatchObject({ dollars: 0, missing: 1 });
    expect(service.movieDetail("movie-1").reports).toHaveLength(1);
    time(cutoff(2027));
    expectRule(() => service.finalize(id, "owner", false), "MISSING_REPORTS");
    service.importData({
      version: 1,
      grosses: [
        {
          movieID: "movie-1",
          amount: 2000000,
          through: "2027-06-03",
          observedAt: "2027-06-04T00:00:00Z",
          source: "https://example.com/correct-gross",
        },
      ],
    });
    expect(score()).toMatchObject({ dollars: 2000000, missing: 0 });
    const final = service.finalize(id, "owner", false);
    service.importData({ version: 1, movies: [{ ...corrected, releaseDate: "2027-06-05" }] });
    expect(service.standings(id, "owner")).toEqual(final);
    expect(service.movieDetail("movie-1").reports).toHaveLength(2);
  });
  test("ordinary imports cannot undo permanent locks", () => {
    const { service, time, catalog } = fixture();
    time(Date.parse("2027-06-02T00:00:00Z"));
    service.tick();
    expectRule(
      () =>
        service.importData({ version: 1, movies: [{ ...catalog[0], releaseDate: "2027-12-01" }] }),
      "LOCKED_RELEASE",
    );
    expect(service.movie("movie-1").releaseDate).toBe("2027-06-01");
  });
  test("explicit release corrections retain source history and ordinary confirmations preserve the lock", () => {
    const { service, time, catalog } = fixture();
    time(Date.parse("2027-06-02T00:00:00Z"));
    service.tick();
    const lockedAt = service.movie("movie-1").lockedAt;
    service.importData({ version: 1, movies: [{ ...catalog[0], releaseStatus: "released" }] });
    expect(service.movie("movie-1").lockedAt).toBe(lockedAt);
    const corrected = {
      ...catalog[0],
      releaseDate: "2027-12-01",
      correctionReason: "Source corrected an erroneous opening date.",
    };
    service.importData({ version: 1, movies: [corrected] });
    expect(service.movie("movie-1").lockedAt).toBeNull();
    expect(service.movieDetail("movie-1").history[0]!.data.correctionReason).toBe(
      corrected.correctionReason,
    );
  });
  test("finalization requires an explicit acknowledgement for missing reports", () => {
    const { service, time } = fixture();
    const id = league(service, 2, 1);
    finishDraft(service, id);
    time(cutoff(2027));
    expectRule(() => service.finalize(id, "owner", false), "MISSING_REPORTS");
    expect(service.finalize(id, "owner", true).finalized).toBe(true);
  });
  test("rejects future observations, earnings before release, and duplicate catalog IDs", () => {
    const { service, catalog } = fixture();
    expectRule(
      () =>
        service.importData({
          version: 1,
          movies: [{ ...catalog[0], researchedAt: "2028-01-01T00:00:00Z" }],
        }),
      "FUTURE_RESEARCH",
    );
    expectRule(
      () =>
        service.importData({
          version: 1,
          grosses: [
            {
              movieID: "movie-1",
              amount: 100,
              through: "2027-01-01",
              observedAt: "2027-01-01T00:00:00Z",
              source: "https://example.com/gross",
            },
          ],
        }),
      "UNRELEASED_GROSS",
    );
    expect(() => service.importData({ version: 1, movies: [catalog[0], catalog[0]] })).toThrow();
    expect(() =>
      service.importData({
        version: 1,
        grosses: [
          {
            movieID: "movie-1",
            amount: 100,
            currency: "EUR",
            through: "2027-01-01",
            observedAt: "2027-01-01T00:00:00Z",
            source: "https://example.com/gross",
          },
        ],
      }),
    ).toThrow();
  });
});

test("snake indices reverse at both round boundaries", () => {
  expect(Array.from({ length: 9 }, (_, i) => snakeIndex(i + 1, 3))).toEqual([
    0, 1, 2, 2, 1, 0, 0, 1, 2,
  ]);
});
