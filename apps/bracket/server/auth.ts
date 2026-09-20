import { createClient } from "@openauthjs/openauth/client";
import { verifyUser } from "@hollyweb/auth/client";
import { Hono, type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { eq, lt } from "drizzle-orm";
import type { BracketDatabase } from "./db";
import type { BracketConfig } from "./config";
import { sessions, loginFlows } from "./db/schema";

export type User = { userID: string; name: string; email: string };
export type AppEnv = { Variables: { user: User | null } };
const hash = (value: string) => new Bun.CryptoHasher("sha256").update(value).digest("hex");

function returnPath(requested: string, origin: string): string {
  const fallback = "/dashboard";
  if (
    !requested.startsWith("/") ||
    requested.startsWith("//") ||
    requested.includes("\\") ||
    [...requested].some(
      (character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127,
    )
  )
    return fallback;
  try {
    const url = new URL(requested, origin);
    // Dot-segment normalization can also turn a local path into a //host reference.
    if (url.origin !== origin || url.pathname.startsWith("//")) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

export function createAuth(db: BracketDatabase, config: BracketConfig) {
  const client = createClient({ clientID: config.clientID, issuer: config.authOrigin });
  const secure = config.origin.startsWith("https://");
  const name = secure ? "__Host-bracket-session" : "bracket-session";
  const flowName = secure ? "__Host-bracket-flow" : "bracket-flow";
  const options = { httpOnly: true, secure, sameSite: "Lax" as const, path: "/" };
  const callback = `${config.origin}/auth/callback`;
  const router = new Hono<AppEnv>();

  router.get("/login", async (c) => {
    const requested = c.req.query("returnTo") ?? "/dashboard";
    const returnTo = returnPath(requested, config.origin);
    const { challenge, url } = await client.authorize(callback, "code", {
      pkce: true,
      provider: "google",
    });
    const token = crypto.randomUUID();
    db.delete(loginFlows).where(lt(loginFlows.expiresAt, Date.now())).run();
    db.insert(loginFlows)
      .values({
        hash: hash(token),
        state: challenge.state,
        verifier: challenge.verifier!,
        returnTo,
        expiresAt: Date.now() + 600_000,
      })
      .run();
    setCookie(c, flowName, token, { ...options, maxAge: 600 });
    return c.redirect(url);
  });
  router.get("/callback", async (c) => {
    const token = getCookie(c, flowName);
    const flow = token
      ? db
          .delete(loginFlows)
          .where(eq(loginFlows.hash, hash(token)))
          .returning()
          .get()
      : undefined;
    deleteCookie(c, flowName, options);
    if (
      !flow ||
      flow.expiresAt <= Date.now() ||
      flow.state !== c.req.query("state") ||
      !c.req.query("code")
    )
      return c.text("This login link expired or is invalid. Please sign in again.", 400);
    const result = await client.exchange(c.req.query("code")!, callback, flow.verifier);
    if (result.err) return c.text("Login failed. Please sign in again.", 401);
    const verified = await verifyUser(client, result.tokens.access, config.clientID);
    if (verified.err) return c.text("Login could not be verified.", 401);
    const old = getCookie(c, name);
    if (old)
      db.delete(sessions)
        .where(eq(sessions.hash, hash(old)))
        .run();
    const session = crypto.randomUUID() + crypto.randomUUID();
    const maxAge = 60 * 60 * 24 * 30;
    db.delete(sessions).where(lt(sessions.expiresAt, Date.now())).run();
    db.insert(sessions)
      .values({
        hash: hash(session),
        access: result.tokens.access,
        refresh: result.tokens.refresh,
        expiresAt: Date.now() + maxAge * 1000,
      })
      .run();
    setCookie(c, name, session, { ...options, maxAge });
    return c.redirect(returnPath(flow.returnTo, config.origin));
  });
  router.post("/logout", (c) => {
    if (c.req.header("origin") !== config.origin) return c.json({ error: "Invalid origin." }, 403);
    const token = getCookie(c, name);
    if (token)
      db.delete(sessions)
        .where(eq(sessions.hash, hash(token)))
        .run();
    deleteCookie(c, name, options);
    return c.json({ ok: true, accountURL: config.authOrigin });
  });

  // Coalesce concurrent refreshes from Query requests for the same browser session.
  const pending = new Map<string, Promise<User | null>>();
  async function resolve(token: string): Promise<User | null> {
    const key = hash(token);
    const session = db.select().from(sessions).where(eq(sessions.hash, key)).get();
    if (!session || session.expiresAt <= Date.now()) return null;
    const result = await verifyUser(client, session.access, config.clientID, session.refresh);
    if (result.err) {
      db.delete(sessions).where(eq(sessions.hash, key)).run();
      return null;
    }
    if (result.tokens)
      db.update(sessions)
        .set({ access: result.tokens.access, refresh: result.tokens.refresh })
        .where(eq(sessions.hash, key))
        .run();
    return result.subject.properties;
  }
  async function user(c: Context): Promise<User | null> {
    const token = getCookie(c, name);
    if (!token) return null;
    let promise = pending.get(token);
    if (!promise) {
      promise = resolve(token).finally(() => pending.delete(token));
      pending.set(token, promise);
    }
    return promise;
  }
  return { router, user };
}
