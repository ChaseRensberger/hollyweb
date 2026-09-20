import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { Entrant, Picks } from "../../shared/bracket";

export const brackets = sqliteTable("brackets", {
  id: text().primaryKey(),
  ownerID: text("owner_id").notNull(),
  shareID: text("share_id").notNull().unique(),
  latestVersion: integer("latest_version").notNull().default(1),
  sharing: integer({ mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const versions = sqliteTable(
  "versions",
  {
    id: text().primaryKey(),
    bracketID: text("bracket_id")
      .notNull()
      .references(() => brackets.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    title: text().notNull(),
    description: text().notNull(),
    entrants: text({ mode: "json" }).$type<Entrant[]>().notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [uniqueIndex("bracket_version").on(table.bracketID, table.number)],
);
export const runs = sqliteTable("runs", {
  id: text().primaryKey(),
  ownerID: text("owner_id").notNull(),
  versionID: text("version_id")
    .notNull()
    .references(() => versions.id, { onDelete: "cascade" }),
  picks: text({ mode: "json" }).$type<Picks>().notNull(),
  revision: integer().notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
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
export const uploads = sqliteTable("uploads", {
  path: text().primaryKey(),
  ownerID: text("owner_id").notNull(),
  createdAt: integer("created_at").notNull(),
});
