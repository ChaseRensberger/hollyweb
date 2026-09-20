import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import sharp from "sharp";
import { bracketInput, validPicks } from "../shared/bracket";
import { brackets, versions, runs, uploads } from "./db/schema";
import type { BracketDatabase } from "./db";
import type { BracketConfig } from "./config";
import { createAuth, type AppEnv } from "./auth";

const picksSchema = z
  .record(z.string().regex(/^r[0-5]m\d{1,2}$/), z.uuid())
  .refine((picks) => Object.keys(picks).length <= 63);
const runInput = z.object({ id: z.uuid(), versionID: z.uuid(), picks: picksSchema });

export function createBracketApp(
  db: BracketDatabase,
  config: BracketConfig,
  auth = createAuth(db, config),
) {
  const app = new Hono<AppEnv>();
  app.use("*", secureHeaders());
  app.onError((error, c) => {
    if (error instanceof z.ZodError)
      return c.json({ error: error.issues[0]?.message ?? "Invalid input." }, 400);
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
    if (error instanceof SyntaxError) return c.json({ error: "Invalid request body." }, 400);
    console.error(error);
    return c.json({ error: "Something went wrong. Please try again." }, 500);
  });
  app.get("/health", (c) => {
    db.select({ id: brackets.id }).from(brackets).limit(1).all();
    return c.json({ status: "ok", service: "hollyweb-bracket" });
  });
  app.route("/auth", auth.router);
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 6 * 1024 * 1024,
      onError: (c) => c.json({ error: "Uploads must be smaller than 5 MB." }, 413),
    }),
  );
  app.use("/api/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(c.req.method) &&
      c.req.header("origin") !== config.origin
    )
      return c.json({ error: "Invalid origin." }, 403);
    const user = await auth.user(c);
    c.set("user", user);
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) && !user)
      return c.json({ error: "Sign in to save your work." }, 401);
    await next();
  });
  app.get("/api/me", (c) => c.json({ user: c.get("user"), accountURL: config.authOrigin }));

  function owned(id: string, ownerID?: string) {
    const bracket = db.select().from(brackets).where(eq(brackets.id, id)).get();
    if (!bracket || bracket.ownerID !== ownerID)
      throw new HTTPException(404, { message: "Bracket not found." });
    return bracket;
  }
  function checkImages(input: z.infer<typeof bracketInput>, ownerID: string) {
    for (const entry of input.entrants) {
      if (!entry.image) continue;
      const file = db.select().from(uploads).where(eq(uploads.path, entry.image)).get();
      if (file?.ownerID !== ownerID)
        throw new HTTPException(400, { message: "Upload your own images for this bracket." });
    }
  }
  function visibleVersion(id: string, userID?: string) {
    const version = db.select().from(versions).where(eq(versions.id, id)).get();
    const bracket = version
      ? db.select().from(brackets).where(eq(brackets.id, version.bracketID)).get()
      : undefined;
    if (!version || !bracket || (!bracket.sharing && bracket.ownerID !== userID))
      throw new HTTPException(404, { message: "This bracket is not available." });
    return version;
  }

  app.get("/api/dashboard", (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Sign in to see your brackets." }, 401);
    const templates = db
      .select({ bracket: brackets, version: versions })
      .from(brackets)
      .innerJoin(
        versions,
        and(eq(versions.bracketID, brackets.id), eq(versions.number, brackets.latestVersion)),
      )
      .where(eq(brackets.ownerID, user.userID))
      .orderBy(desc(brackets.updatedAt))
      .all();
    const savedRuns = db
      .select({ run: runs, version: versions })
      .from(runs)
      .innerJoin(versions, eq(runs.versionID, versions.id))
      .where(eq(runs.ownerID, user.userID))
      .orderBy(desc(runs.updatedAt))
      .all();
    return c.json({ brackets: templates, runs: savedRuns });
  });
  app.post("/api/brackets", async (c) => {
    const input = bracketInput.parse(await c.req.json());
    const ownerID = c.get("user")!.userID;
    checkImages(input, ownerID);
    const now = Date.now();
    const bracket = db.transaction((tx) => {
      const record = tx
        .insert(brackets)
        .values({
          id: crypto.randomUUID(),
          shareID: crypto.randomUUID(),
          ownerID,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      tx.insert(versions)
        .values({
          id: crypto.randomUUID(),
          bracketID: record.id,
          number: 1,
          ...input,
          createdAt: now,
        })
        .run();
      return record;
    });
    return c.json(bracket, 201);
  });
  app.get("/api/brackets/:id", (c) => {
    const bracket = owned(c.req.param("id"), c.get("user")?.userID);
    const version = db
      .select()
      .from(versions)
      .where(and(eq(versions.bracketID, bracket.id), eq(versions.number, bracket.latestVersion)))
      .get()!;
    return c.json({ bracket, version });
  });
  app.put("/api/brackets/:id", async (c) => {
    const body = z
      .object({ input: bracketInput, expectedVersion: z.number().int().positive() })
      .parse(await c.req.json());
    const bracket = owned(c.req.param("id"), c.get("user")!.userID);
    checkImages(body.input, bracket.ownerID);
    db.transaction((tx) => {
      const updated = tx
        .update(brackets)
        .set({ latestVersion: bracket.latestVersion + 1, updatedAt: Date.now() })
        .where(and(eq(brackets.id, bracket.id), eq(brackets.latestVersion, body.expectedVersion)))
        .returning()
        .get();
      if (!updated)
        throw new HTTPException(409, {
          message: "This bracket changed in another tab. Reload before editing.",
        });
      tx.insert(versions)
        .values({
          id: crypto.randomUUID(),
          bracketID: bracket.id,
          number: updated.latestVersion,
          ...body.input,
          createdAt: Date.now(),
        })
        .run();
    });
    return c.json({ ...bracket, latestVersion: bracket.latestVersion + 1 });
  });
  app.patch("/api/brackets/:id/sharing", async (c) => {
    const bracket = owned(c.req.param("id"), c.get("user")!.userID);
    const { sharing } = z.object({ sharing: z.boolean() }).parse(await c.req.json());
    db.update(brackets).set({ sharing }).where(eq(brackets.id, bracket.id)).run();
    return c.json({ sharing });
  });
  app.delete("/api/brackets/:id", (c) => {
    const bracket = owned(c.req.param("id"), c.get("user")!.userID);
    db.delete(brackets).where(eq(brackets.id, bracket.id)).run();
    return c.json({ ok: true });
  });
  app.get("/api/shared/:shareID", (c) => {
    const bracket = db
      .select()
      .from(brackets)
      .where(eq(brackets.shareID, c.req.param("shareID")))
      .get();
    if (!bracket || (!bracket.sharing && bracket.ownerID !== c.get("user")?.userID))
      throw new HTTPException(404, { message: "This bracket is private or has been deleted." });
    const version = db
      .select()
      .from(versions)
      .where(and(eq(versions.bracketID, bracket.id), eq(versions.number, bracket.latestVersion)))
      .get()!;
    return c.json({ shareID: bracket.shareID, version });
  });
  app.post("/api/runs", async (c) => {
    const input = runInput.parse(await c.req.json());
    const ownerID = c.get("user")!.userID;
    const existing = db.select().from(runs).where(eq(runs.id, input.id)).get();
    if (existing) {
      if (existing.ownerID !== ownerID || existing.versionID !== input.versionID)
        throw new HTTPException(409, { message: "Run ID is already in use." });
      return c.json(existing);
    }
    const version = visibleVersion(input.versionID, ownerID);
    if (!validPicks(version.entrants, input.picks))
      throw new HTTPException(400, { message: "This run contains invalid picks." });
    return c.json(
      db
        .insert(runs)
        .values({ ...input, ownerID, createdAt: Date.now(), updatedAt: Date.now() })
        .returning()
        .get(),
      201,
    );
  });
  app.get("/api/runs/:id", (c) => {
    const run = db
      .select()
      .from(runs)
      .where(eq(runs.id, c.req.param("id")))
      .get();
    if (!run || run.ownerID !== c.get("user")?.userID)
      throw new HTTPException(404, { message: "Run not found." });
    const version = db.select().from(versions).where(eq(versions.id, run.versionID)).get()!;
    return c.json({ run, version });
  });
  app.put("/api/runs/:id", async (c) => {
    const input = z
      .object({ picks: picksSchema, revision: z.number().int().nonnegative() })
      .parse(await c.req.json());
    const run = db
      .select()
      .from(runs)
      .where(eq(runs.id, c.req.param("id")))
      .get();
    if (!run || run.ownerID !== c.get("user")!.userID)
      throw new HTTPException(404, { message: "Run not found." });
    const version = db.select().from(versions).where(eq(versions.id, run.versionID)).get()!;
    if (!validPicks(version.entrants, input.picks))
      throw new HTTPException(400, { message: "This run contains invalid picks." });
    const updated = db
      .update(runs)
      .set({ picks: input.picks, revision: run.revision + 1, updatedAt: Date.now() })
      .where(and(eq(runs.id, run.id), eq(runs.revision, input.revision)))
      .returning()
      .get();
    if (!updated)
      throw new HTTPException(409, {
        message: "This run changed in another tab. Reload to use its latest picks.",
      });
    return c.json(updated);
  });
  app.delete("/api/runs/:id", (c) => {
    const user = c.get("user")!;
    db.delete(runs)
      .where(and(eq(runs.id, c.req.param("id")), eq(runs.ownerID, user.userID)))
      .run();
    return c.json({ ok: true });
  });
  app.post("/api/uploads", async (c) => {
    const body = await c.req.formData();
    const file = body.get("image");
    if (!(file instanceof File) || file.size > 5 * 1024 * 1024 || file.size === 0)
      throw new HTTPException(400, { message: "Choose an image smaller than 5 MB." });
    let image: Buffer;
    try {
      image = await sharp(await file.arrayBuffer(), { limitInputPixels: 25_000_000 })
        .rotate()
        .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw new HTTPException(400, {
        message: "This image could not be read. Try a PNG, JPEG, GIF, or WebP.",
      });
    }
    const filename = `${crypto.randomUUID()}.webp`;
    await mkdir(config.uploads, { recursive: true });
    await Bun.write(join(config.uploads, filename), image);
    const path = `/uploads/${filename}`;
    db.insert(uploads)
      .values({ path, ownerID: c.get("user")!.userID, createdAt: Date.now() })
      .run();
    return c.json({ path }, 201);
  });
  app.get("/uploads/:filename", async (c) => {
    const filename = c.req.param("filename");
    if (!/^[a-f0-9-]{36}\.webp$/.test(filename)) return c.notFound();
    const file = Bun.file(join(config.uploads, filename));
    if (!(await file.exists())) return c.notFound();
    return new Response(file, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
  app.all("/api/*", (c) => c.json({ error: "Endpoint not found." }, 404));
  return app;
}
