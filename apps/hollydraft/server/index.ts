import { openDatabase } from "./db";
import { hollydraftConfig } from "./config";
import { HollyDraft } from "./service";
import { createHollyDraftApp } from "./app";

const store = openDatabase();
const config = hollydraftConfig();
const service = new HollyDraft(store);
service.tick();
const app = createHollyDraftApp(service, config);
const server = Bun.serve({
  port: Number(process.env.PORT ?? 3003),
  idleTimeout: 120,
  fetch: app.fetch,
});
const timer = setInterval(() => {
  try {
    service.tick();
  } catch (error) {
    console.error("HollyDraft background job failed", error);
  }
}, 1000);
async function stop() {
  clearInterval(timer);
  await server.stop(true);
  store.sqlite.close();
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
console.log(`HollyDraft listening on ${server.url}`);
