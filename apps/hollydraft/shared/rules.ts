import { z } from "zod";

export const name = z.string().trim().min(1).max(100);
export const movieID = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/);
export const date = z.iso.date();
const https = z
  .url()
  .refine((value) => new URL(value).protocol === "https:", "Use an HTTPS source URL.");
export const leagueInput = z.object({
  name,
  teamName: name,
  season: z.number().int().min(2027).max(2100),
  capacity: z.number().int().min(2).max(16).default(8),
  slots: z.number().int().min(1).max(16).default(8),
  pickSeconds: z.number().int().min(15).max(300).default(60),
});
export const leagueUpdate = leagueInput.omit({ teamName: true, season: true }).partial().extend({
  capacity: leagueInput.shape.capacity.removeDefault().optional(),
  slots: leagueInput.shape.slots.removeDefault().optional(),
  pickSeconds: leagueInput.shape.pickSeconds.removeDefault().optional(),
});
export const movieInput = z.object({
  id: movieID,
  title: name,
  studio: name,
  season: z.number().int().min(1900).max(2100),
  rank: z.number().int().min(1).max(100000),
  releaseDate: date.nullable(),
  releaseStatus: z.enum(["scheduled", "released", "canceled"]),
  source: https,
  researchedAt: z.iso.datetime(),
  poster: z
    .object({ url: https, source: https, kind: z.enum(["poster", "teaser", "logo"]) })
    .nullable(),
  imdbID: z
    .string()
    .regex(/^tt\d+$/)
    .nullable()
    .default(null),
  wikidataID: z
    .string()
    .regex(/^Q\d+$/)
    .nullable()
    .default(null),
  correctionReason: z.string().trim().min(1).max(500).optional(),
});
export const grossInput = z.object({
  movieID,
  amount: z.number().int().min(0).max(100_000_000_000),
  currency: z.literal("USD").default("USD"),
  through: date,
  observedAt: z.iso.datetime(),
  source: https,
  reason: z.string().trim().min(1).max(500).optional(),
});
export const importInput = z
  .object({
    version: z.literal(1),
    movies: z.array(movieInput).max(10000).default([]),
    grosses: z.array(grossInput).max(10000).default([]),
  })
  .refine((value) => value.movies.length + value.grosses.length > 0, "Import is empty.")
  .refine(
    (value) => new Set(value.movies.map((movie) => movie.id)).size === value.movies.length,
    "Duplicate movie IDs.",
  );
export type MovieInput = z.infer<typeof movieInput>;
export type GrossInput = z.infer<typeof grossInput>;

export function cutoff(season: number) {
  return Date.UTC(season + 1, 3, 1);
}
export function releaseTime(releaseDate: string | null) {
  return releaseDate ? Date.parse(`${releaseDate}T00:00:00Z`) : null;
}
export function releaseSeason(movie: Pick<MovieInput, "releaseDate" | "season">) {
  return movie.releaseDate ? Number(movie.releaseDate.slice(0, 4)) : movie.season;
}
export function snakeIndex(overall: number, managers: number) {
  const index = (overall - 1) % managers;
  return Math.floor((overall - 1) / managers) % 2 ? managers - 1 - index : index;
}
export function randomized<T>(values: T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    // Rejection sampling avoids modulo bias.
    const max = 0x100000000 - (0x100000000 % (i + 1));
    let value: number;
    do {
      value = crypto.getRandomValues(new Uint32Array(1))[0]!;
    } while (value >= max);
    const j = value % (i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
