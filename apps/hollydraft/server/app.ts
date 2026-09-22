import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { streamSSE } from "hono/streaming";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { movieID, name } from "../shared/rules";
import { createAuth, type AppEnv } from "./auth";
import type { HollyDraftConfig } from "./config";
import { imports, movies } from "./db/schema";
import { HollyDraft, RuleError } from "./service";

const cursor = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const ids = z.array(movieID).min(1).max(16);
export function createHollyDraftApp(
  service: HollyDraft,
  config: HollyDraftConfig,
  auth = createAuth(service.db, config),
) {
  const app = new Hono<AppEnv>();
  app.use("*", secureHeaders());
  app.onError((error, c) => {
    if (error instanceof RuleError)
      return c.json({ code: error.code, error: error.message }, error.status);
    if (error instanceof z.ZodError)
      return c.json(
        { code: "INVALID_INPUT", error: error.issues[0]?.message ?? "Invalid input." },
        400,
      );
    if (error instanceof SyntaxError)
      return c.json({ code: "INVALID_JSON", error: "Invalid JSON body." }, 400);
    if (error instanceof HTTPException)
      return c.json({ code: "HTTP_ERROR", error: error.message }, error.status);
    console.error(error);
    return c.json({ code: "INTERNAL_ERROR", error: "The request failed." }, 500);
  });
  app.get("/", (c) => c.json({ service: "HollyDraft", api: "/api", login: "/auth/login" }));
  app.get("/health", (c) => {
    service.db.select({ id: movies.id }).from(movies).limit(1).all();
    return c.json({ status: "ok", service: "hollyweb-hollydraft" });
  });
  app.route("/auth", auth.router);
  app.use("/api/*", bodyLimit({ maxSize: 64 * 1024 }));
  app.use("/api/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    if (!["GET", "HEAD"].includes(c.req.method) && c.req.header("origin") !== config.origin) {
      return c.json({ code: "INVALID_ORIGIN", error: "Invalid origin." }, 403);
    }
    c.set("user", await auth.user(c));
    await next();
  });
  app.get("/api/me", (c) => c.json({ user: c.get("user"), accountURL: config.authOrigin }));
  app.get("/api/movies", (c) => {
    const input = z
      .object({
        season: z.coerce.number().int().min(1900).max(2100).optional(),
        search: z.string().max(100).optional(),
        candidates: z.enum(["true", "false"]).optional(),
        offset: cursor.default(0),
        limit: z.coerce.number().int().min(1).max(200).default(100),
      })
      .parse(c.req.query());
    const latestImport = service.db
      .select()
      .from(imports)
      .orderBy(desc(imports.importedAt))
      .limit(1)
      .get();
    return c.json({
      ...service.catalog({ ...input, candidates: input.candidates === "true" }),
      lastImportAt: latestImport?.importedAt ?? null,
      updateMode: "manual",
    });
  });
  app.get("/api/movies/:id", (c) => c.json(service.movieDetail(c.req.param("id"))));
  app.get("/api/invites/:token", (c) => c.json(service.invitePreview(c.req.param("token"))));
  app.use("/api/*", async (c, next) => {
    if (!c.get("user"))
      return c.json({ code: "AUTH_REQUIRED", error: "Sign in to use HollyDraft." }, 401);
    await next();
  });
  app.get("/api/leagues", (c) => c.json({ leagues: service.myLeagues(c.get("user")!.userID) }));
  app.post("/api/leagues", async (c) =>
    c.json(service.createLeague(c.get("user")!.userID, await c.req.json()), 201),
  );
  app.get("/api/leagues/:id", (c) =>
    c.json(service.details(c.req.param("id"), c.get("user")!.userID)),
  );
  app.patch("/api/leagues/:id", async (c) =>
    c.json(service.editLeague(c.req.param("id"), c.get("user")!.userID, await c.req.json())),
  );
  app.post("/api/leagues/:id/invite", (c) =>
    c.json(service.invite(c.req.param("id"), c.get("user")!.userID), 201),
  );
  app.delete("/api/leagues/:id/invite", (c) => {
    service.revokeInvite(c.req.param("id"), c.get("user")!.userID);
    return c.json({ ok: true });
  });
  app.post("/api/invites/:token/join", async (c) => {
    const input = z.object({ name }).parse(await c.req.json());
    return c.json(service.join(c.req.param("token"), c.get("user")!.userID, input.name));
  });
  app.patch("/api/leagues/:id/team", async (c) => {
    const input = z.object({ name }).parse(await c.req.json());
    return c.json(service.rename(c.req.param("id"), c.get("user")!.userID, input.name));
  });
  app.delete("/api/leagues/:id/members/:teamID", (c) => {
    service.removeMember(c.req.param("id"), c.get("user")!.userID, c.req.param("teamID"));
    return c.json({ ok: true });
  });
  app.post("/api/leagues/:id/draft/start", (c) =>
    c.json(service.startDraft(c.req.param("id"), c.get("user")!.userID)),
  );
  app.get("/api/leagues/:id/draft", (c) =>
    c.json(service.draftState(c.req.param("id"), c.get("user")!.userID)),
  );
  app.post("/api/leagues/:id/draft/pick", async (c) => {
    const input = z
      .object({ movieID, expectedPick: z.number().int().min(1).max(256) })
      .parse(await c.req.json());
    return c.json(
      service.pick(c.req.param("id"), c.get("user")!.userID, input.movieID, input.expectedPick),
    );
  });
  app.post("/api/leagues/:id/draft/pause", (c) =>
    c.json(service.pause(c.req.param("id"), c.get("user")!.userID, false)),
  );
  app.post("/api/leagues/:id/draft/resume", (c) =>
    c.json(service.pause(c.req.param("id"), c.get("user")!.userID, true)),
  );
  app.get("/api/leagues/:id/queue", (c) =>
    c.json({ movies: service.getQueue(c.req.param("id"), c.get("user")!.userID) }),
  );
  app.put("/api/leagues/:id/queue", async (c) => {
    const input = z.object({ movies: z.array(movieID).max(1000) }).parse(await c.req.json());
    return c.json({
      movies: service.setQueue(c.req.param("id"), c.get("user")!.userID, input.movies),
    });
  });
  app.get("/api/leagues/:id/rosters", (c) =>
    c.json({ rosters: service.roster(c.req.param("id"), c.get("user")!.userID) }),
  );
  app.get("/api/leagues/:id/trades", (c) =>
    c.json({ trades: service.listTrades(c.req.param("id"), c.get("user")!.userID) }),
  );
  app.post("/api/leagues/:id/trades", async (c) => {
    const input = z
      .object({ recipientID: z.uuid(), give: ids, receive: ids })
      .parse(await c.req.json());
    return c.json(
      service.propose(
        c.req.param("id"),
        c.get("user")!.userID,
        input.recipientID,
        input.give,
        input.receive,
      ),
      201,
    );
  });
  app.post("/api/leagues/:id/trades/:tradeID/:action", (c) => {
    const action = z.enum(["accept", "reject", "cancel"]).parse(c.req.param("action"));
    return c.json(
      service.resolve(c.req.param("id"), c.get("user")!.userID, c.req.param("tradeID"), action),
    );
  });
  app.get("/api/leagues/:id/standings", (c) =>
    c.json(service.standings(c.req.param("id"), c.get("user")!.userID)),
  );
  app.post("/api/leagues/:id/finalize", async (c) => {
    const input = z
      .object({ acknowledgeMissing: z.boolean().default(false) })
      .parse(await c.req.json());
    return c.json(
      service.finalize(c.req.param("id"), c.get("user")!.userID, input.acknowledgeMissing),
    );
  });
  app.get("/api/leagues/:id/activity", (c) => {
    const after = cursor.parse(c.req.query("after") ?? 0);
    const rows = service.activity(c.req.param("id"), c.get("user")!.userID, after);
    return c.json({ events: rows, next: rows.at(-1)?.id ?? after });
  });
  app.get("/api/leagues/:id/events", (c) => {
    const id = c.req.param("id");
    const userID = c.get("user")!.userID;
    service.member(id, userID);
    let after = cursor.parse(c.req.header("last-event-id") ?? c.req.query("after") ?? 0);
    c.header("X-Accel-Buffering", "no");
    return streamSSE(c, async (stream) => {
      let stopped = false;
      stream.onAbort(() => {
        stopped = true;
      });
      // Periodically reconnect to re-check the session and avoid indefinitely authorized streams.
      const expires = Date.now() + 60_000;
      while (!stopped && Date.now() < expires) {
        const rows = service.activity(id, userID, after);
        for (const row of rows) {
          await stream.writeSSE({ id: String(row.id), event: row.type, data: JSON.stringify(row) });
          after = row.id;
        }
        if (rows.length < 100) {
          await stream.writeSSE({
            event: "heartbeat",
            data: JSON.stringify({ serverTime: service.now() }),
          });
          await stream.sleep(1000);
        }
      }
    });
  });
  return app;
}
