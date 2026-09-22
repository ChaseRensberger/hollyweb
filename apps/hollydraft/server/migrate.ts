import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { openDatabase } from "./db";
const { db, sqlite } = openDatabase();
migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
sqlite.close();
console.log("HollyDraft migrations applied.");
