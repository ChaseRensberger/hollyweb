import index from "../client/index.html";
import { openDatabase } from "./db";
import { bracketConfig } from "./config";
import { createBracketApp } from "./app";

const config = bracketConfig();
const { db } = openDatabase();
const app = createBracketApp(db, config);
const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  maxRequestBodySize: 6 * 1024 * 1024,
  routes: {
    "/": index,
    "/dashboard": index,
    "/new": index,
    "/edit/:id": index,
    "/b/:shareID": index,
    "/play/:shareID": index,
    "/run/:id": index,
  },
  fetch: app.fetch,
  // Bun 1.3.14 HMR throws before mounting React when a stylesheet link has no href
  // (including links injected by browser extensions). Use manual browser refresh.
  development: process.env.NODE_ENV !== "production" && { hmr: false, console: true },
});
console.log(`Bracket listening on ${server.url}`);
