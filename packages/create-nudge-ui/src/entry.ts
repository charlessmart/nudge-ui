#!/usr/bin/env node
import { runCli } from "./cli.ts";

runCli().catch((error: Error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Nudge UI setup failed."}\n`);
  process.exitCode = 1;
});
