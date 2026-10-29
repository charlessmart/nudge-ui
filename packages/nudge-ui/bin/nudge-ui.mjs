#!/usr/bin/env node
import { main } from "../dist/nudge-ui.mjs";

void main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
