const processes = ["apps/auth", "apps/bracket", "apps/hollydraft"].map((cwd) =>
  Bun.spawn(["bun", "run", "dev"], { cwd, stdout: "inherit", stderr: "inherit" }),
);
function stop() {
  for (const child of processes) child.kill();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await Promise.race(processes.map((child) => child.exited));
stop();
