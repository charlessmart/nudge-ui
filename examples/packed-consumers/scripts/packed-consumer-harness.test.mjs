import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";
import {
  matchesExpectedMountFailure,
  stopProcess,
} from "./packed-consumer-harness.mjs";

test("matchesExpectedMountFailure only accepts the configured diagnostic source", () => {
  const expectedFailure = {
    source: "server",
    pattern: /Could not resolve "virtual:design-tokens"/,
  };

  assert.equal(matchesExpectedMountFailure(expectedFailure, {
    server: ['Could not resolve "virtual:design-tokens"'],
    browser: [],
  }), true);
  assert.equal(matchesExpectedMountFailure(expectedFailure, {
    server: [],
    browser: ['Could not resolve "virtual:design-tokens"'],
  }), false);
  assert.equal(matchesExpectedMountFailure(expectedFailure, {
    server: ["react-dom/client does not provide an export named 'createRoot'"],
    browser: [],
  }), false);
});

test("stopProcess escalates when a development server ignores SIGTERM", async () => {
  const child = spawn(process.execPath, [
    "-e",
    "process.on('SIGTERM', () => {}); process.send('ready'); setInterval(() => {}, 1000);",
  ], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  await new Promise((resolveReady) => child.once("message", resolveReady));

  const result = await stopProcess(child, { terminateTimeoutMs: 25, killTimeoutMs: 1_000 });

  assert.deepEqual(result, { code: null, signal: "SIGKILL" });
});
