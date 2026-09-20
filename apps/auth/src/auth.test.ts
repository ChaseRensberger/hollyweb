import { afterAll, describe, expect, test } from "bun:test";
import { createClient } from "@openauthjs/openauth/client";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Hono } from "hono";
import { openDatabase } from "./db";
import { createAuthApp } from "./app";
import { sessions, users } from "./schema";
import { sqliteStorage } from "./storage";
import { verifyUser } from "./client";

const { db, sqlite } = openDatabase(":memory:");
migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
let app = new Hono();
const server = Bun.serve({ port: 0, fetch: (request) => app.fetch(request) });
const origin = server.url.origin;
const callbacks = {
  bracket: ["https://bracket.hollyweb.test/auth/callback"],
  future: ["https://future.hollyweb.test/auth/callback"],
};
app = createAuthApp(db, { origin, clients: callbacks, clientID: "", clientSecret: "" });
const userID = crypto.randomUUID();
db.insert(users)
  .values({
    id: userID,
    googleID: "google-subject",
    email: "person@example.com",
    name: "Holly Tester",
    createdAt: Date.now(),
  })
  .run();
const sso = crypto.randomUUID();
db.insert(sessions)
  .values({
    hash: new Bun.CryptoHasher("sha256").update(sso).digest("hex"),
    userID,
    expiresAt: Date.now() + 60_000,
  })
  .run();
afterAll(() => {
  server.stop(true);
  sqlite.close();
});

async function authorize(clientID: keyof typeof callbacks, token: string = sso) {
  const client = createClient({ clientID, issuer: origin });
  const callback = callbacks[clientID][0]!;
  const { challenge, url } = await client.authorize(callback, "code", {
    pkce: true,
    provider: "google",
  });
  const start = await fetch(url, { redirect: "manual" });
  const cookies = [
    `holly-sso=${token}`,
    ...start.headers.getSetCookie().map((cookie) => cookie.split(";")[0]),
  ].join("; ");
  const response = await fetch(new URL(start.headers.get("location")!, origin), {
    redirect: "manual",
    headers: { Cookie: cookies },
  });
  return { client, callback, challenge, response };
}

describe("central Hollyweb authentication", () => {
  test("existing SSO signs into two apps with the same stable identity", async () => {
    for (const clientID of ["bracket", "future"] as const) {
      const { client, callback, challenge, response } = await authorize(clientID);
      expect(response.status).toBe(302);
      const location = new URL(response.headers.get("location")!);
      expect(location.origin).toBe(new URL(callback).origin);
      expect(location.searchParams.get("state")).toBe(challenge.state);
      const exchanged = await client.exchange(
        location.searchParams.get("code")!,
        callback,
        challenge.verifier,
      );
      expect(exchanged.err).toBeFalsy();
      if (exchanged.err) throw exchanged.err;
      const verified = await verifyUser(client, exchanged.tokens.access, clientID);
      expect(verified.err).toBeFalsy();
      if (verified.err) throw verified.err;
      expect(verified.subject.properties.userID).toBe(userID);
      const otherApp = await verifyUser(client, exchanged.tokens.access, "different-app");
      expect(otherApp.err).toBeTruthy();
      const replay = await client.exchange(
        location.searchParams.get("code")!,
        callback,
        challenge.verifier,
      );
      expect(replay.err).toBeTruthy();
    }
  });
  test("rejects a bad PKCE verifier", async () => {
    const { client, callback, response } = await authorize("bracket");
    const code = new URL(response.headers.get("location")!).searchParams.get("code")!;
    expect((await client.exchange(code, callback, "wrong-verifier")).err).toBeTruthy();
  });
  test("rejects unregistered redirect URLs", async () => {
    const client = createClient({ clientID: "bracket", issuer: origin });
    const { url } = await client.authorize("https://evil.example/auth/callback", "code", {
      pkce: true,
    });
    const response = await fetch(url, { redirect: "manual" });
    expect(response.status).not.toBe(302);
    expect(await response.text()).toContain("Unauthorized");
  });
  test("missing or expired central sessions cannot bypass Google login", async () => {
    const { response } = await authorize("bracket", "invalid-session");
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("Google login is not configured");
  });
  test("SSO logout is origin-checked and revokes the central session", async () => {
    const denied = await fetch(`${origin}/logout`, {
      method: "POST",
      headers: { Cookie: `holly-sso=${sso}`, Origin: "https://evil.example" },
      redirect: "manual",
    });
    expect(denied.status).toBe(403);
    const logout = await fetch(`${origin}/logout`, {
      method: "POST",
      headers: { Cookie: `holly-sso=${sso}`, Origin: origin },
      redirect: "manual",
    });
    expect(logout.status).toBe(302);
    expect((await authorize("bracket")).response.status).toBe(503);
  });
});

test("auth storage respects expiry, segment prefixes, and persistence", async () => {
  const storage = sqliteStorage(db);
  await storage.set(["test", "a"], { value: 1 });
  await storage.set(["testing", "b"], { value: 2 });
  await storage.set(["test", "expired"], { value: 3 }, new Date(Date.now() - 1));
  expect(await sqliteStorage(db).get(["test", "a"])).toEqual({ value: 1 });
  expect(await storage.get(["test", "expired"])).toBeUndefined();
  const keys = [];
  for await (const [key] of storage.scan(["test"])) keys.push(key);
  expect(keys).toEqual([["test", "a"]]);
  await storage.remove(["test", "a"]);
  expect(await storage.get(["test", "a"])).toBeUndefined();
});
