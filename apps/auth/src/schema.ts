import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text().primaryKey(),
  googleID: text("google_id").notNull().unique(),
  email: text().notNull(),
  name: text().notNull(),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  hash: text().primaryKey(),
  userID: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
});

export const authStorage = sqliteTable("auth_storage", {
  key: text().primaryKey(),
  value: text({ mode: "json" }).$type<Record<string, unknown>>().notNull(),
  expiresAt: integer("expires_at"),
});
