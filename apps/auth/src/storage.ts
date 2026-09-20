import type { StorageAdapter } from "@openauthjs/openauth/storage/storage";
import { eq } from "drizzle-orm";
import type { AuthDatabase } from "./db";
import { authStorage } from "./schema";

export function sqliteStorage(db: AuthDatabase): StorageAdapter {
  return {
    async get(key) {
      const record = db
        .select()
        .from(authStorage)
        .where(eq(authStorage.key, JSON.stringify(key)))
        .get();
      if (!record) return;
      if (record.expiresAt !== null && record.expiresAt <= Date.now()) {
        await this.remove(key);
        return;
      }
      return record.value;
    },
    async set(key, value: Record<string, unknown>, expiry) {
      const record = { key: JSON.stringify(key), value, expiresAt: expiry?.getTime() ?? null };
      db.insert(authStorage)
        .values(record)
        .onConflictDoUpdate({ target: authStorage.key, set: record })
        .run();
    },
    async remove(key) {
      db.delete(authStorage)
        .where(eq(authStorage.key, JSON.stringify(key)))
        .run();
    },
    async *scan(prefix) {
      // Compare decoded segments: a string prefix would conflate unrelated keys.
      for (const record of db.select().from(authStorage).all()) {
        const key = JSON.parse(record.key) as string[];
        if (prefix.every((part, index) => key[index] === part)) {
          const value = await this.get(key);
          if (value !== undefined) yield [key, value];
        }
      }
    },
  };
}
