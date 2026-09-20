import { authConfig } from "./config";
import { openDatabase } from "./db";
import { createAuthApp } from "./app";

const config = authConfig();
const { db } = openDatabase();
const app = createAuthApp(db, config);
const server = Bun.serve({
  port: Number(process.env.PORT ?? 3001),
  fetch(request) {
    // Use the configured public origin, including behind a TLS-terminating proxy.
    const url = new URL(request.url);
    const headers = new Headers(request.headers);
    headers.delete("x-forwarded-host");
    headers.delete("x-forwarded-proto");
    return app.fetch(
      new Request(config.origin + url.pathname + url.search, {
        method: request.method,
        headers,
        body: request.body,
        redirect: "manual",
      }),
    );
  },
});
console.log(`Hollyweb auth listening on ${server.url} (issuer: ${config.origin})`);
