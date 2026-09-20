import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

export function openDatabase(path = process.env.AUTH_DATABASE ?? "data/auth.sqlite") {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  return { sqlite, db: drizzle(sqlite, { schema }) };
}
export type AuthDatabase = ReturnType<typeof openDatabase>["db"];
