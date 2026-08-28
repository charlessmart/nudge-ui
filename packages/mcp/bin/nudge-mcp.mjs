#!/usr/bin/env node
import { runCli } from "../dist/cli.mjs";

runCli().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "nudge-mcp failed"}\n`);
  process.exitCode = 1;
});
