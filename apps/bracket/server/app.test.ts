import { afterAll, beforeAll, expect, test } from "bun:test";
import { Hono } from "hono";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createBracketApp } from "./app";
import { openDatabase } from "./db";
import { createAuth, type AppEnv } from "./auth";
import { loginFlows } from "./db/schema";
import { tournament, chooseWinner, type BracketInput } from "../shared/bracket";
import type { Bracket, Template, Run, SavedRun } from "../client/api";

const { db, sqlite } = openDatabase(":memory:");
beforeAll(() => migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname }));
afterAll(() => {
  sqlite.close();
  rmSync(config.uploads, { recursive: true, force: true });
});
const origin = "http://bracket.test";
const config = {
  origin,
  authOrigin: "http://auth.test",
  clientID: "bracket",
  uploads: mkdtempSync(join(tmpdir(), "hollyweb-api-")),
};
const app = createBracketApp(db, config, {
  router: new Hono<AppEnv>(),
  user: async (c) => {
    const id = c.req.header("x-test-user");
    return id ? { userID: id, name: id, email: `${id}@example.com` } : null;
  },
});
const input = (size = 9): BracketInput => ({
  title: "Best contenders",
  description: "A real bracket",
  entrants: Array.from({ length: size }, (_, i) => ({
    id: crypto.randomUUID(),
    name: `Seed ${i + 1}`,
    image: null,
  })),
});
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  user = "owner",
  requestOrigin = origin,
) {
  return app.request(`${origin}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: requestOrigin,
      ...(user ? { "x-test-user": user } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("CRUD, ownership, immutable versions, guest saves, concurrency, and sharing", async () => {
  const field = input();
  expect((await request("/api/brackets", "POST", field, "")).status).toBe(401);
  expect((await request("/api/brackets", "POST", field, "owner", "https://evil.test")).status).toBe(
    403,
  );
  const created = await request("/api/brackets", "POST", field);
  expect(created.status).toBe(201);
  const bracket = (await created.json()) as Bracket;
  expect((await request(`/api/brackets/${bracket.id}`, "GET", undefined, "other")).status).toBe(
    404,
  );
  expect((await request(`/api/brackets/${bracket.id}`, "DELETE", undefined, "other")).status).toBe(
    404,
  );
  const { version } = (await (
    await request(`/api/shared/${bracket.shareID}`, "GET", undefined, "")
  ).json()) as Template;
  const first = tournament(field.entrants).next!;
  const picks = chooseWinner(field.entrants, {}, first.id, first.a!.id);
  const runID = crypto.randomUUID();
  const saved = await request(
    "/api/runs",
    "POST",
    { id: runID, versionID: version.id, picks },
    "player",
  );
  expect(saved.status).toBe(201);
  const run = (await saved.json()) as Run;
  expect(run.picks).toEqual(picks);
  expect((await request(`/api/runs/${run.id}`, "GET", undefined, "other")).status).toBe(404);
  expect(
    (await request("/api/runs", "POST", { id: runID, versionID: version.id, picks }, "player"))
      .status,
  ).toBe(200);
  expect(
    (
      await request(
        "/api/runs",
        "POST",
        { id: crypto.randomUUID(), versionID: version.id, picks: { r5m0: field.entrants[0]!.id } },
        "player",
      )
    ).status,
  ).toBe(400);

  const edited = { ...field, title: "Updated title", entrants: [...field.entrants].reverse() };
  expect(
    (await request(`/api/brackets/${bracket.id}`, "PUT", { input: edited, expectedVersion: 1 }))
      .status,
  ).toBe(200);
  expect(
    (await request(`/api/brackets/${bracket.id}`, "PUT", { input: edited, expectedVersion: 1 }))
      .status,
  ).toBe(409);
  const oldRun = (await (
    await request(`/api/runs/${run.id}`, "GET", undefined, "player")
  ).json()) as SavedRun;
  expect(oldRun.version.title).toBe(field.title);
  expect(oldRun.version.entrants).toEqual(field.entrants);
  const latest = (await (await request(`/api/shared/${bracket.shareID}`)).json()) as Template;
  expect(latest.version.number).toBe(2);
  expect(latest.version.title).toBe(edited.title);

  expect(
    (await request(`/api/runs/${run.id}`, "PUT", { picks, revision: 0 }, "player")).status,
  ).toBe(200);
  expect(
    (await request(`/api/runs/${run.id}`, "PUT", { picks: {}, revision: 0 }, "player")).status,
  ).toBe(409);
  expect(
    (await request(`/api/brackets/${bracket.id}/sharing`, "PATCH", { sharing: false })).status,
  ).toBe(200);
  expect((await request(`/api/shared/${bracket.shareID}`, "GET", undefined, "")).status).toBe(404);
  expect((await request(`/api/runs/${run.id}`, "GET", undefined, "player")).status).toBe(200);
  expect((await request(`/api/brackets/${bracket.id}`, "DELETE")).status).toBe(200);
  expect((await request(`/api/runs/${run.id}`, "GET", undefined, "player")).status).toBe(404);
  expect((await request(`/api/shared/${bracket.shareID}`)).status).toBe(404);
});

test("invalid fields and unowned uploads are rejected", async () => {
  expect((await request("/api/brackets", "POST", input(7))).status).toBe(400);
  const field = input(8);
  field.entrants[0]!.image = `/uploads/${crypto.randomUUID()}.webp`;
  expect((await request("/api/brackets", "POST", field)).status).toBe(400);
  expect((await request("/api/brackets", "POST", { ...input(), title: " " })).status).toBe(400);
});

test.each([
  ["/dashboard", "/dashboard"],
  ["/play/comfort-food?view=tree#round-2", "/play/comfort-food?view=tree#round-2"],
  ["/a/../dashboard", "/dashboard"],
  ["/", "/"],
  ["https://evil.example", "/dashboard"],
  ["//evil.example", "/dashboard"],
  ["/\\evil.example", "/dashboard"],
  ["/\t/evil.example", "/dashboard"],
  ["/\n/evil.example", "/dashboard"],
  ["/\r/evil.example", "/dashboard"],
  ["/\u0000/evil.example", "/dashboard"],
  ["/a/..//evil.example", "/dashboard"],
  ["/a/%2e%2e//evil.example", "/dashboard"],
  ["", "/dashboard"],
])("login validates return path %j", async (requested, expected) => {
  const auth = createAuth(db, config);
  const response = await auth.router.request(
    `${origin}/login?returnTo=${encodeURIComponent(requested)}`,
  );
  expect(response.status).toBe(302);
  const authorization = new URL(response.headers.get("location")!);
  const flow = db
    .select()
    .from(loginFlows)
    .where(eq(loginFlows.state, authorization.searchParams.get("state")!))
    .get()!;
  expect(flow.returnTo).toBe(expected);
  expect(new URL(flow.returnTo, origin).origin).toBe(origin);
});

test("OAuth callback rejects unsolicited, mismatched, and reused browser state", async () => {
  const auth = createAuth(db, config);
  const response = await auth.router.request(`${origin}/callback?code=forged&state=forged`);
  expect(response.status).toBe(400);
  const logout = await auth.router.request(`${origin}/logout`, {
    method: "POST",
    headers: { Origin: "https://evil.test" },
  });
  expect(logout.status).toBe(403);
  const flowToken = crypto.randomUUID();
  const flowHash = new Bun.CryptoHasher("sha256").update(flowToken).digest("hex");
  db.insert(loginFlows)
    .values({
      hash: flowHash,
      state: "expected-state",
      verifier: "verifier",
      returnTo: "/dashboard",
      expiresAt: Date.now() + 60_000,
    })
    .run();
  const mismatch = await auth.router.request(`${origin}/callback?code=forged&state=wrong-state`, {
    headers: { Cookie: `bracket-flow=${flowToken}` },
  });
  expect(mismatch.status).toBe(400);
  expect(db.select().from(loginFlows).where(eq(loginFlows.hash, flowHash)).get()).toBeUndefined();
  const replay = await auth.router.request(`${origin}/callback?code=forged&state=expected-state`, {
    headers: { Cookie: `bracket-flow=${flowToken}` },
  });
  expect(replay.status).toBe(400);
});

test("uploads are normalized, served correctly, and checked for ownership", async () => {
  const png = await sharp({
    create: { width: 1600, height: 800, channels: 3, background: "#99434b" },
  })
    .png()
    .toBuffer();
  const body = new FormData();
  body.set("image", new File([new Uint8Array(png)], "sample.png", { type: "image/png" }));
  const uploaded = await app.request(`${origin}/api/uploads`, {
    method: "POST",
    headers: { Origin: origin, "x-test-user": "image-owner" },
    body,
  });
  expect(uploaded.status).toBe(201);
  const { path } = (await uploaded.json()) as { path: string };
  const image = await app.request(`${origin}${path}`);
  expect(image.headers.get("content-type")).toBe("image/webp");
  const metadata = await sharp(await image.arrayBuffer()).metadata();
  expect(metadata.width).toBe(1200);
  expect(metadata.height).toBe(600);
  const field = input(8);
  field.entrants[0]!.image = path;
  expect((await request("/api/brackets", "POST", field, "other")).status).toBe(400);
  expect((await request("/api/brackets", "POST", field, "image-owner")).status).toBe(201);
  const invalid = new FormData();
  invalid.set("image", new File(["not an image"], "bad.png", { type: "image/png" }));
  expect(
    (
      await app.request(`${origin}/api/uploads`, {
        method: "POST",
        headers: { Origin: origin, "x-test-user": "image-owner" },
        body: invalid,
      })
    ).status,
  ).toBe(400);
});
