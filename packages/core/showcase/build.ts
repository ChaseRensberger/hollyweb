import tailwind from "bun-plugin-tailwind";
const result = await Bun.build({
  entrypoints: ["./showcase/index.html"],
  outdir: "./dist",
  plugins: [tailwind],
  minify: true,
});
if (!result.success) throw new AggregateError(result.logs, "Core gallery build failed.");
