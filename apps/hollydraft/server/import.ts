import { openDatabase } from "./db";
import { HollyDraft } from "./service";

const args = Bun.argv.slice(2);
const path = args.find((argument) => !argument.startsWith("--"));
if (!path || args.some((argument) => argument.startsWith("--") && argument !== "--preview")) {
  console.error("Usage: bun run data:import <file.json> [--preview]");
  process.exit(1);
}
const store = openDatabase();
try {
  const result = new HollyDraft(store).importData(
    await Bun.file(path).json(),
    args.includes("--preview"),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  store.sqlite.close();
}
