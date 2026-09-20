import { z } from "zod";
export function bracketConfig() {
  const origin = new URL(z.url().parse(process.env.BRACKET_ORIGIN ?? "http://localhost:3000"))
    .origin;
  const authOrigin = new URL(z.url().parse(process.env.AUTH_ORIGIN ?? "http://localhost:3001"))
    .origin;
  if (
    process.env.NODE_ENV === "production" &&
    (!origin.startsWith("https://") || !authOrigin.startsWith("https://"))
  )
    throw new Error("Production BRACKET_ORIGIN and AUTH_ORIGIN must use HTTPS.");
  return {
    origin,
    authOrigin,
    clientID: process.env.AUTH_CLIENT_ID ?? "bracket",
    uploads: process.env.UPLOAD_DIRECTORY ?? "data/uploads",
  };
}
export type BracketConfig = ReturnType<typeof bracketConfig>;
