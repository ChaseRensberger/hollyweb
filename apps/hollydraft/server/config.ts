import { z } from "zod";
export function hollydraftConfig() {
  const origin = new URL(z.url().parse(process.env.HOLLYDRAFT_ORIGIN ?? "http://localhost:3003"))
    .origin;
  const authOrigin = new URL(z.url().parse(process.env.AUTH_ORIGIN ?? "http://localhost:3001"))
    .origin;
  if (
    process.env.NODE_ENV === "production" &&
    (!origin.startsWith("https://") || !authOrigin.startsWith("https://"))
  ) {
    throw new Error("Production HOLLYDRAFT_ORIGIN and AUTH_ORIGIN must use HTTPS.");
  }
  return { origin, authOrigin, clientID: process.env.AUTH_CLIENT_ID ?? "hollydraft" };
}
export type HollyDraftConfig = ReturnType<typeof hollydraftConfig>;
