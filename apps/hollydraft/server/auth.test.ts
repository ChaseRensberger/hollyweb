import { afterAll, expect, test } from "bun:test";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createClient } from "@openauthjs/openauth/client";
import { createAuthApp } from "../../auth/src/app";
import { openDatabase as openIssuer } from "../../auth/src/db";
import { users, sessions as centralSessions } from "../../auth/src/schema";
import { createAuth, hash, returnPath, type AppEnv } from "./auth";
import { createHollyDraftApp } from "./app";
import { HollyDraft } from "./service";
import { openDatabase } from "./db";
import { loginFlows, sessions } from "./db/schema";

const issuerStore = openIssuer(":memory:");
const store = openDatabase(":memory:");
migrate(issuerStore.db, {
  migrationsFolder: new URL("../../auth/drizzle", import.meta.url).pathname,
});
migrate(store.db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
let issuerApp = new Hono();
const issuer = Bun.serve({ port: 0, fetch: (request) => issuerApp.fetch(request) });
let app = new Hono<AppEnv>();
const server = Bun.serve({ port: 0, fetch: (request) => app.fetch(request) });
const origin = server.url.origin;
const config = { origin, authOrigin: issuer.url.origin, clientID: "hollydraft" };
const auth = createAuth(store.db, config);
app = createHollyDraftApp(new HollyDraft(store), config, auth);
const callbacks = {
  hollydraft: [`${origin}/auth/callback`],
  bracket: [`${origin}/bracket-callback`],
};
issuerApp = createAuthApp(issuerStore.db, {
  origin: issuer.url.origin,
  clients: callbacks,
  clientID: "",
  clientSecret: "",
});
const userID = crypto.randomUUID();
issuerStore.db
  .insert(users)
  .values({
    id: userID,
    googleID: "hollydraft-test-google-sub",
    name: "Draft Tester",
    email: "draft@example.com",
    createdAt: Date.now(),
  })
  .run();
const sso = crypto.randomUUID();
issuerStore.db
  .insert(centralSessions)
  .values({ hash: hash(sso), userID, expiresAt: Date.now() + 120000 })
  .run();
afterAll(() => {
  server.stop(true);
  issuer.stop(true);
  store.sqlite.close();
  issuerStore.sqlite.close();
});
async function centralLogin(url: string) {
  const start = await fetch(url, { redirect: "manual" });
  const cookies = [
    `holly-sso=${sso}`,
    ...start.headers.getSetCookie().map((cookie) => cookie.split(";")[0]),
  ].join("; ");
  return fetch(new URL(start.headers.get("location")!, issuer.url), {
    redirect: "manual",
    headers: { Cookie: cookies },
  });
}
test("HollyDraft uses central SSO, consumes callback state, and owns its local session", async () => {
  const login = await fetch(`${origin}/auth/login?returnTo=%2Fapi%2Fme`, { redirect: "manual" });
  const flowCookie = login.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("hollydraft-flow="))!
    .split(";")[0]!;
  const authorized = await centralLogin(login.headers.get("location")!);
  const callback = authorized.headers.get("location")!;
  const signedIn = await fetch(callback, { redirect: "manual", headers: { Cookie: flowCookie } });
  expect(signedIn.status).toBe(302);
  expect(signedIn.headers.get("location")).toBe("/api/me");
  const sessionCookie = signedIn.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("hollydraft-session="))!;
  expect(sessionCookie).toContain("HttpOnly");
  expect(sessionCookie).toContain("SameSite=Lax");
  const cookie = sessionCookie.split(";")[0]!;
  const me = await fetch(`${origin}/api/me`, { headers: { Cookie: cookie } });
  expect(await me.json()).toHaveProperty("user.userID", userID);
  expect(
    (await fetch(callback, { redirect: "manual", headers: { Cookie: flowCookie } })).status,
  ).toBe(400);
  const wrongCookie = cookie.replace("hollydraft-session=", "bracket-session=");
  expect(
    await (await fetch(`${origin}/api/me`, { headers: { Cookie: wrongCookie } })).json(),
  ).toHaveProperty("user", null);
  expect(
    (
      await fetch(`${origin}/auth/logout`, {
        method: "POST",
        headers: { Origin: "https://evil.test", Cookie: cookie },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await fetch(`${origin}/auth/logout`, {
        method: "POST",
        headers: { Origin: origin, Cookie: cookie },
      })
    ).status,
  ).toBe(200);
  expect(
    await (await fetch(`${origin}/api/me`, { headers: { Cookie: cookie } })).json(),
  ).toHaveProperty("user", null);
});
test("tokens for Bracket cannot authenticate a HollyDraft session", async () => {
  const client = createClient({ clientID: "bracket", issuer: issuer.url.origin });
  const callback = callbacks.bracket[0]!;
  const { url, challenge } = await client.authorize(callback, "code", {
    pkce: true,
    provider: "google",
  });
  const response = await centralLogin(url);
  const code = new URL(response.headers.get("location")!).searchParams.get("code")!;
  const exchange = await client.exchange(code, callback, challenge.verifier);
  if (exchange.err) throw exchange.err;
  const token = crypto.randomUUID();
  store.db
    .insert(sessions)
    .values({
      hash: hash(token),
      access: exchange.tokens.access,
      refresh: exchange.tokens.refresh,
      expiresAt: Date.now() + 60000,
    })
    .run();
  const me = await fetch(`${origin}/api/me`, {
    headers: { Cookie: `hollydraft-session=${token}` },
  });
  expect(await me.json()).toHaveProperty("user", null);
});
test("invalid callback state consumes the flow and unsolicited callbacks fail", async () => {
  expect((await fetch(`${origin}/auth/callback?code=forged&state=forged`)).status).toBe(400);
  const login = await fetch(`${origin}/auth/login`, { redirect: "manual" });
  const flowCookie = login.headers.getSetCookie()[0]!.split(";")[0]!;
  expect(
    (
      await fetch(`${origin}/auth/callback?code=forged&state=wrong`, {
        headers: { Cookie: flowCookie },
      })
    ).status,
  ).toBe(400);
  const token = flowCookie.slice(flowCookie.indexOf("=") + 1);
  expect(
    store.db
      .select()
      .from(loginFlows)
      .where(eq(loginFlows.hash, hash(token)))
      .get(),
  ).toBeUndefined();
});
test.each([
  "//evil.test",
  "/\t/evil.test",
  "/\n/evil.test",
  "/\\evil.test",
  "/a/..//evil.test",
  "https://evil.test",
  "/\u0000bad",
])("rejects external or malformed login return path %j", (path) => {
  expect(returnPath(path, origin)).toBe("/");
});
test("normalizes a local return path", () => {
  expect(returnPath("/a/../api/me?view=full#team", origin)).toBe("/api/me?view=full#team");
});
