import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import type { MovieInput } from "../../shared/rules";

export type Score = {
  teamID: string;
  name: string;
  dollars: number;
  points: number;
  rank: number;
  missing: number;
};

export const movies = sqliteTable("movies", {
  id: text().primaryKey(),
  title: text().notNull(),
  studio: text().notNull(),
  season: integer().notNull(),
  rank: integer().notNull(),
  releaseDate: text("release_date"),
  releaseStatus: text("release_status").notNull(),
  source: text().notNull(),
  researchedAt: integer("researched_at").notNull(),
  poster: text({ mode: "json" }).$type<MovieInput["poster"]>(),
  imdbID: text("imdb_id"),
  wikidataID: text("wikidata_id"),
  lockedAt: integer("locked_at"),
});
export const imports = sqliteTable("imports", {
  hash: text().primaryKey(),
  importedAt: integer("imported_at").notNull(),
  summary: text({ mode: "json" }).notNull(),
});
export const movieRevisions = sqliteTable("movie_revisions", {
  id: integer().primaryKey({ autoIncrement: true }),
  movieID: text("movie_id")
    .notNull()
    .references(() => movies.id),
  data: text({ mode: "json" }).$type<MovieInput>().notNull(),
  importedAt: integer("imported_at").notNull(),
});
export const grossReports = sqliteTable(
  "gross_reports",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    movieID: text("movie_id")
      .notNull()
      .references(() => movies.id),
    amount: integer().notNull(),
    through: text().notNull(),
    observedAt: integer("observed_at").notNull(),
    source: text().notNull(),
    reason: text(),
    hash: text().notNull().unique(),
  },
  (t) => [index("gross_movie_date").on(t.movieID, t.through)],
);
export const leagues = sqliteTable("leagues", {
  id: text().primaryKey(),
  name: text().notNull(),
  commissionerID: text("commissioner_id").notNull(),
  season: integer().notNull(),
  capacity: integer().notNull(),
  slots: integer().notNull(),
  pickSeconds: integer("pick_seconds").notNull(),
  state: text().notNull().default("lobby"),
  createdAt: integer("created_at").notNull(),
  finalScores: text("final_scores", { mode: "json" }).$type<Score[]>(),
});
export const teams = sqliteTable(
  "teams",
  {
    id: text().primaryKey(),
    leagueID: text("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    userID: text("user_id").notNull(),
    name: text().notNull(),
    joinedAt: integer("joined_at").notNull(),
  },
  (t) => [uniqueIndex("team_membership").on(t.leagueID, t.userID)],
);
export const invites = sqliteTable("invites", {
  hash: text().primaryKey(),
  leagueID: text("league_id")
    .notNull()
    .references(() => leagues.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
});
export const drafts = sqliteTable("drafts", {
  leagueID: text("league_id")
    .primaryKey()
    .references(() => leagues.id, { onDelete: "cascade" }),
  order: text({ mode: "json" }).$type<string[]>().notNull(),
  pool: text({ mode: "json" }).$type<string[]>().notNull(),
  nextPick: integer("next_pick").notNull().default(1),
  deadline: integer(),
  paused: integer({ mode: "boolean" }).notNull().default(false),
  remaining: integer().notNull(),
  pauseReason: text("pause_reason"),
});
export const picks = sqliteTable(
  "picks",
  {
    id: text().primaryKey(),
    leagueID: text("league_id")
      .notNull()
      .references(() => leagues.id),
    teamID: text("team_id")
      .notNull()
      .references(() => teams.id),
    movieID: text("movie_id")
      .notNull()
      .references(() => movies.id),
    overall: integer().notNull(),
    automatic: integer({ mode: "boolean" }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("pick_number").on(t.leagueID, t.overall),
    uniqueIndex("pick_movie").on(t.leagueID, t.movieID),
  ],
);
export const rosters = sqliteTable(
  "rosters",
  {
    id: text().primaryKey(),
    leagueID: text("league_id")
      .notNull()
      .references(() => leagues.id),
    teamID: text("team_id")
      .notNull()
      .references(() => teams.id),
    movieID: text("movie_id")
      .notNull()
      .references(() => movies.id),
  },
  (t) => [uniqueIndex("roster_movie").on(t.leagueID, t.movieID)],
);
export const queues = sqliteTable("queues", {
  teamID: text("team_id")
    .primaryKey()
    .references(() => teams.id, { onDelete: "cascade" }),
  movies: text({ mode: "json" }).$type<string[]>().notNull(),
});
export const trades = sqliteTable("trades", {
  id: text().primaryKey(),
  leagueID: text("league_id")
    .notNull()
    .references(() => leagues.id),
  senderID: text("sender_id")
    .notNull()
    .references(() => teams.id),
  recipientID: text("recipient_id")
    .notNull()
    .references(() => teams.id),
  give: text({ mode: "json" }).$type<string[]>().notNull(),
  receive: text({ mode: "json" }).$type<string[]>().notNull(),
  state: text().notNull().default("pending"),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  resolvedAt: integer("resolved_at"),
});
export const events = sqliteTable(
  "events",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    leagueID: text("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    type: text().notNull(),
    data: text({ mode: "json" }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("league_events").on(t.leagueID, t.id)],
);
export const sessions = sqliteTable("sessions", {
  hash: text().primaryKey(),
  access: text().notNull(),
  refresh: text().notNull(),
  expiresAt: integer("expires_at").notNull(),
});
export const loginFlows = sqliteTable("login_flows", {
  hash: text().primaryKey(),
  state: text().notNull(),
  verifier: text().notNull(),
  returnTo: text("return_to").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
