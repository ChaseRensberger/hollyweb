import { z } from "zod";

export const entrantSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(100),
  image: z
    .string()
    .regex(/^\/uploads\/[a-f0-9-]+\.(png|jpg|webp|gif)$/)
    .nullable()
    .default(null),
});
export const bracketInput = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).default(""),
    entrants: z.array(entrantSchema).min(8).max(64),
  })
  .refine(
    (value) => new Set(value.entrants.map((entry) => entry.id)).size === value.entrants.length,
    { message: "Each entrant must have a unique ID." },
  );
export type Entrant = z.infer<typeof entrantSchema>;
export type BracketInput = z.infer<typeof bracketInput>;
export type Picks = Record<string, string>;
export type Match = {
  id: string;
  round: number;
  index: number;
  a: Entrant | null;
  b: Entrant | null;
  winner: Entrant | null;
  status: "waiting" | "ready" | "complete" | "bye";
};

export function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const next = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, next - seed]);
  }
  return order;
}

export function tournament(entrants: Entrant[], picks: Picks = {}) {
  if (entrants.length < 8 || entrants.length > 64)
    throw new Error("A bracket needs 8–64 entrants.");
  const size = 2 ** Math.ceil(Math.log2(entrants.length));
  let sources = seedOrder(size).map((seed) => ({
    entry: entrants[seed - 1] ?? null,
    resolved: true,
  }));
  const rounds: Match[][] = [];
  let round = 0;
  while (sources.length > 1) {
    const matches: Match[] = [];
    for (let i = 0; i < sources.length; i += 2) {
      const left = sources[i]!;
      const right = sources[i + 1]!;
      const id = `r${round}m${i / 2}`;
      const ready = left.resolved && right.resolved;
      const bye = ready && (!left.entry || !right.entry);
      const picked = picks[id];
      const winner = bye
        ? (left.entry ?? right.entry)
        : ready
          ? ([left.entry, right.entry].find((entry) => entry?.id === picked) ?? null)
          : null;
      matches.push({
        id,
        round,
        index: i / 2,
        a: left.entry,
        b: right.entry,
        winner,
        status: bye ? "bye" : winner ? "complete" : ready ? "ready" : "waiting",
      });
    }
    rounds.push(matches);
    sources = matches.map((match) => ({
      entry: match.winner,
      resolved: match.status === "bye" || match.status === "complete",
    }));
    round++;
  }
  const matches = rounds.flat();
  return {
    rounds,
    matches,
    next: matches.find((match) => match.status === "ready") ?? null,
    winner: rounds.at(-1)?.[0]?.winner ?? null,
    completed: matches.filter((match) => match.status === "complete").length,
    total: entrants.length - 1,
  };
}

export function chooseWinner(
  entrants: Entrant[],
  picks: Picks,
  matchID: string,
  entrantID: string,
): Picks {
  const tree = tournament(entrants, picks);
  const match = tree.matches.find((item) => item.id === matchID);
  if (
    !match ||
    (match.status !== "ready" && match.status !== "complete") ||
    ![match.a?.id, match.b?.id].includes(entrantID)
  )
    throw new Error("Choose an entrant in an available matchup.");
  if (picks[matchID] === entrantID) return picks;
  const next = { ...picks, [matchID]: entrantID };
  let index = match.index;
  for (let round = match.round + 1; round < tree.rounds.length; round++) {
    index = Math.floor(index / 2);
    delete next[`r${round}m${index}`];
  }
  return next;
}

export function validPicks(entrants: Entrant[], picks: Picks): boolean {
  const tree = tournament(entrants, picks);
  return Object.entries(picks).every(([id, winner]) =>
    tree.matches.some(
      (match) => match.id === id && match.status === "complete" && match.winner?.id === winner,
    ),
  );
}

export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
