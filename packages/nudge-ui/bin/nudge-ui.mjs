#!/usr/bin/env node
import { main } from "../dist/nudge-ui.mjs";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
void main(process.argv.slice(2), version).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
