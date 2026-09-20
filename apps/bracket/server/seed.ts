import { eq } from "drizzle-orm";
import type { BracketDatabase } from "./db";
import { brackets, versions } from "./db/schema";

// A real, playable starter bracket. Stable sharing URL; never overwrites existing data.
export function seedExample(db: BracketDatabase) {
  if (db.select().from(brackets).where(eq(brackets.shareID, "comfort-food")).get()) return;
  db.transaction((tx) => {
    const id = crypto.randomUUID();
    tx.insert(brackets)
      .values({
        id,
        ownerID: "hollyweb",
        shareID: "comfort-food",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();
    tx.insert(versions)
      .values({
        id: crypto.randomUUID(),
        bracketID: id,
        number: 1,
        title: "The comfort food bracket",
        description: "",
        entrants: [
          "Pizza",
          "Tacos",
          "Burgers",
          "Ramen",
          "Grilled cheese",
          "Mac & cheese",
          "Dumplings",
          "Pasta",
        ].map((name) => ({ id: crypto.randomUUID(), name, image: null })),
        createdAt: Date.now(),
      })
      .run();
  });
}
