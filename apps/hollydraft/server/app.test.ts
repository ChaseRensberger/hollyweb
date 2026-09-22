import { afterEach, beforeEach, expect, test } from "bun:test";
import { Hono } from "hono";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createHollyDraftApp } from "./app";
import { HollyDraft } from "./service";
import { openDatabase, type Store } from "./db";
import type { AppEnv } from "./auth";
import catalog from "../catalog/2027.json";

let store: Store;
let time = Date.parse("2026-12-31T12:00:00Z");
let service: HollyDraft;
const origin = "http://hollydraft.test";
let app: ReturnType<typeof createHollyDraftApp>;
beforeEach(() => {
  time = Date.parse("2026-12-31T12:00:00Z");
  store = openDatabase(":memory:");
  service = new HollyDraft(store, () => time);
  app = createHollyDraftApp(
    service,
    { origin, authOrigin: "http://auth.test", clientID: "hollydraft" },
    {
      router: new Hono<AppEnv>(),
      user: async (c) => {
        const userID = c.req.header("x-test-user");
        return userID ? { userID, name: userID, email: `${userID}@example.com` } : null;
      },
    },
  );
  migrate(store.db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  service.importData(catalog);
});
afterEach(() => store.sqlite.close());
function request(
  path: string,
  method = "GET",
  body?: unknown,
  user = "owner",
  requestOrigin = origin,
) {
  return app.request(`${origin}${path}`, {
    method,
    headers: { "x-test-user": user, Origin: requestOrigin, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function setup() {
  const response = await request("/api/leagues", "POST", {
    name: "League",
    teamName: "Owner",
    season: 2027,
    capacity: 2,
    slots: 1,
  });
  expect(response.status).toBe(201);
  const league = (await response.json()) as { id: string };
  const invitation = (await (await request(`/api/leagues/${league.id}/invite`, "POST")).json()) as {
    token: string;
  };
  return { id: league.id, token: invitation.token };
}

test("catalog imports the sourced season and exposes candidates without making logos draftable", async () => {
  const response = await request("/api/movies?season=2027&candidates=true", "GET", undefined, "");
  expect(response.status).toBe(200);
  const data = (await response.json()) as {
    total: number;
    draftable: number;
    updateMode: string;
    movies: Array<{ id: string; draftable: boolean }>;
  };
  expect(data.total).toBe(64);
  expect(data.draftable).toBeGreaterThanOrEqual(12);
  expect(data.draftable).toBeLessThan(64);
  expect(data.updateMode).toBe("manual");
  expect(data.movies.find((movie) => movie.id === "frozen-3")!.draftable).toBe(false);
  const detail = (await (await request("/api/movies/shrek-5")).json()) as {
    reports: unknown[];
    history: unknown[];
  };
  expect(detail.reports).toHaveLength(0);
  expect(detail.history).toHaveLength(1);
});
test("all private endpoints require login and write endpoints require same origin", async () => {
  expect((await request("/api/leagues", "GET", undefined, "")).status).toBe(401);
  expect((await request("/api/leagues", "POST", {}, "owner", "https://evil.test")).status).toBe(
    403,
  );
  expect((await request("/api/leagues", "POST", { season: 2027 }, "owner")).status).toBe(400);
  expect((await request("/api/movies?limit=9000")).status).toBe(400);
});
test("concurrent joins fill one remaining slot, then cross-league access is denied", async () => {
  const { id, token } = await setup();
  const attempts = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      request(`/api/invites/${token}/join`, "POST", { name: `Team ${i}` }, `user-${i}`),
    ),
  );
  expect(attempts.filter((response) => response.status === 200)).toHaveLength(1);
  expect(attempts.filter((response) => response.status === 409)).toHaveLength(7);
  for (const suffix of [
    "",
    "/draft",
    "/queue",
    "/rosters",
    "/standings",
    "/trades",
    "/activity",
    "/events",
  ]) {
    expect(
      (await request(`/api/leagues/${id}${suffix}`, "GET", undefined, "outsider")).status,
    ).toBe(404);
  }
});
test("full API flow completes a draft, accepts a trade, scores an import, and finalizes", async () => {
  const { id, token } = await setup();
  const base = `/api/leagues/${id}`;
  const joined = await request(`/api/invites/${token}/join`, "POST", { name: "Guest" }, "guest");
  expect(joined.status).toBe(200);
  expect((await request(`${base}/draft/start`, "POST", undefined, "guest")).status).toBe(403);
  const start = await request(`${base}/draft/start`, "POST");
  expect(start.status).toBe(200);
  const details = service.details(id, "owner");
  for (const movieID of ["shrek-5", "gatto"]) {
    const draft = service.draftState(id, "owner");
    const manager = details.teams.find((team) => team.id === draft.currentTeamID)!.userID;
    const response = await request(
      `${base}/draft/pick`,
      "POST",
      { movieID, expectedPick: draft.nextPick },
      manager,
    );
    expect(response.status).toBe(200);
  }
  const roster = service.roster(id, "owner");
  const owner = service.member(id, "owner");
  const guest = service.member(id, "guest");
  const proposal = await request(`${base}/trades`, "POST", {
    recipientID: guest.id,
    give: [roster.find((r) => r.teamID === owner.id)!.movie.id],
    receive: [roster.find((r) => r.teamID === guest.id)!.movie.id],
  });
  const offer = (await proposal.json()) as { id: string };
  expect(proposal.status).toBe(201);
  expect(
    (await request(`${base}/trades/${offer.id}/accept`, "POST", undefined, "guest")).status,
  ).toBe(200);
  time = Date.parse("2028-04-01T01:00:00Z");
  service.tick();
  // Synthetic earnings exist only in this isolated test database.
  service.importData({
    version: 1,
    grosses: ["shrek-5", "gatto"].map((movieID, i) => ({
      movieID,
      amount: (i + 1) * 1000000,
      through: "2028-03-31",
      observedAt: "2028-04-01T00:00:00Z",
      source: "https://example.com/fictional-test-report",
    })),
  });
  const standings = (await (await request(`${base}/standings`)).json()) as {
    scores: Array<{ points: number }>;
  };
  expect(standings.scores.map((s) => s.points)).toEqual([2, 1]);
  const finalized = await request(`${base}/finalize`, "POST", {});
  expect(finalized.status).toBe(200);
  expect(await finalized.json()).toHaveProperty("finalized", true);
  const events = service.activity(id, "owner");
  expect(events.some((event) => event.type === "trade.accepted")).toBe(true);
  const tail = (await (await request(`${base}/activity?after=${events.at(-2)!.id}`)).json()) as {
    events: Array<{ type: string }>;
  };
  expect(tail.events).toHaveLength(1);
  expect(tail.events[0]!.type).toBe("league.finalized");
  time = Date.parse("2026-12-31T12:00:00Z");
});
test("SSE replays persisted events after Last-Event-ID", async () => {
  const { id } = await setup();
  service.rename(id, "owner", "Renamed");
  service.event(id, "test.replay", { value: 1 });
  const history = service.activity(id, "owner");
  const response = await app.request(`${origin}/api/leagues/${id}/events`, {
    headers: { "x-test-user": "owner", "Last-Event-ID": String(history[0]!.id) },
  });
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  const reader = response.body!.getReader();
  const first = await reader.read();
  expect(new TextDecoder().decode(first.value)).toContain("test.replay");
  await reader.cancel();
});
test("simultaneous duplicate pick requests commit exactly one selection", async () => {
  const { id, token } = await setup();
  await request(`/api/invites/${token}/join`, "POST", { name: "Guest" }, "guest");
  service.startDraft(id, "owner");
  const state = service.draftState(id, "owner");
  const user = service
    .details(id, "owner")
    .teams.find((team) => team.id === state.currentTeamID)!.userID;
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      request(
        `/api/leagues/${id}/draft/pick`,
        "POST",
        { movieID: "shrek-5", expectedPick: 1 },
        user,
      ),
    ),
  );
  expect(results.filter((response) => response.status === 200)).toHaveLength(1);
  expect(results.filter((response) => response.status === 409)).toHaveLength(3);
  expect(service.draftState(id, "owner").picks).toHaveLength(1);
});
