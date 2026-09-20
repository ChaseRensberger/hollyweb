import { serveStatic } from "hono/bun";
import { openDatabase } from "./db";
import { bracketConfig } from "./config";
import { createBracketApp } from "./app";

const { db } = openDatabase();
const app = createBracketApp(db, bracketConfig());
const root = `${import.meta.dir}/public`;
app.use("/*", serveStatic({ root }));
app.get("*", serveStatic({ root, path: "index.html" }));
const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  maxRequestBodySize: 6 * 1024 * 1024,
  fetch: app.fetch,
});
console.log(`Bracket production server listening on ${server.url}`);
