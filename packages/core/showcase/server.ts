import index from "./index.html";
const server = Bun.serve({
  port: Number(process.env.PORT ?? 3002),
  routes: { "/*": index },
  development: { hmr: true, console: true },
});
console.log(`Holly Core gallery: ${server.url}`);
