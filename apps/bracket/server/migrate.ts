import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { openDatabase } from "./db";
import { seedExample } from "./seed";
const { db, sqlite } = openDatabase();
migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
seedExample(db);
sqlite.close();
console.log("Bracket migrations applied.");
