import { runCli } from "./cli.ts";

runCli().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "nudge-mcp failed"}\n`);
  process.exitCode = 1;
});
