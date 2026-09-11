#!/usr/bin/env node
import { main } from "../dist/nudge-ui.mjs";

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
