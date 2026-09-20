import { z } from "zod";

export function authConfig() {
  const production = process.env.NODE_ENV === "production";
  const origin = z.url().parse(process.env.AUTH_ORIGIN ?? "http://localhost:3001");
  const clients = z
    .record(z.string(), z.array(z.url()))
    .parse(
      JSON.parse(process.env.AUTH_CLIENTS ?? '{"bracket":["http://localhost:3000/auth/callback"]}'),
    );
  const clientID = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  if (
    production &&
    (!clientID || !clientSecret || !origin.startsWith("https://") || !process.env.AUTH_CLIENTS)
  ) {
    throw new Error(
      "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, HTTPS AUTH_ORIGIN, and AUTH_CLIENTS.",
    );
  }
  return { origin: new URL(origin).origin, clients, clientID, clientSecret };
}
export type AuthConfig = ReturnType<typeof authConfig>;
