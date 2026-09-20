import { rm } from "node:fs/promises";
import tailwind from "bun-plugin-tailwind";
await rm("./dist", { recursive: true, force: true });
const frontend = await Bun.build({
  entrypoints: ["./client/index.html"],
  outdir: "./dist/public",
  publicPath: "/",
  plugins: [tailwind],
  minify: true,
  splitting: true,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
if (!frontend.success) throw new AggregateError(frontend.logs, "Client build failed.");
const server = await Bun.build({
  entrypoints: ["./server/production.ts"],
  target: "bun",
  outdir: "./dist",
  packages: "external",
  minify: true,
});
if (!server.success) throw new AggregateError(server.logs, "Server build failed.");
console.log("Bracket client and production server built.");
