import { spawn } from "node:child_process";
import { once } from "node:events";
import { expect, test } from "vitest";
import {
  appendDiagnostic,
  matchesExpectedMountFailure,
  stopProcess,
} from "./packed-consumer-harness.mjs";

test("matchesExpectedMountFailure only accepts the configured diagnostic source", () => {
  const expectedFailure = {
    source: "server",
    pattern: /Could not resolve "virtual:design-tokens"/,
  };

  expect(matchesExpectedMountFailure(expectedFailure, {
    server: 'Could not resolve "virtual:design-tokens"',
    browser: "",
  })).toBe(true);
  expect(matchesExpectedMountFailure(expectedFailure, {
    server: "",
    browser: 'Could not resolve "virtual:design-tokens"',
  })).toBe(false);
  expect(matchesExpectedMountFailure(expectedFailure, {
    server: "react-dom/client does not provide an export named 'createRoot'",
    browser: "",
  })).toBe(false);
});

test("matchesExpectedMountFailure preserves messages split across stream chunks", () => {
  const diagnostics = { server: "", browser: "" };
  appendDiagnostic(diagnostics, "server", 'Could not resolve "virtual:design-');
  appendDiagnostic(diagnostics, "server", 'tokens"');

  expect(matchesExpectedMountFailure({
    source: "server",
    pattern: /Could not resolve "virtual:design-tokens"/,
  }, diagnostics)).toBe(true);
});

test("stopProcess escalates when a development server ignores SIGTERM", async () => {
  const child = spawn(process.execPath, [
    "-e",
    "process.on('SIGTERM', () => {}); process.send('ready'); setInterval(() => {}, 1000);",
  ], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  const childPid = child.pid;
  expect(childPid).toBeDefined();

  try {
    await once(child, "message");
    const result = await stopProcess(child, { terminateTimeoutMs: 25, killTimeoutMs: 1_000 });

    expect(result).toEqual({ code: null, signal: "SIGKILL" });
  } finally {
    killProcessGroup(childPid);
  }
});

test("stopProcess removes descendants after the process-group leader exits", async () => {
  const leader = spawn(process.execPath, [
    "-e",
    `
      const { spawn } = require("node:child_process");
      const descendant = spawn(process.execPath, [
        "-e",
        "process.on('SIGTERM', () => {}); process.send('ready'); setInterval(() => {}, 1000);",
      ], { stdio: ["ignore", "ignore", "ignore", "ipc"] });
      descendant.once("message", () => process.send(descendant.pid));
      setInterval(() => {}, 1000);
    `,
  ], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  const leaderPid = leader.pid;
  expect(leaderPid).toBeDefined();

  try {
    const [descendantPid] = await once(leader, "message");
    await stopProcess(leader, { terminateTimeoutMs: 100, killTimeoutMs: 1_000 });

    expect(await waitForProcessToDisappear(descendantPid, 1_000)).toBe(true);
  } finally {
    killProcessGroup(leaderPid);
  }
});

test("registerProcessCleanup stops the detached server before forwarding SIGINT", async () => {
  const harnessUrl = new URL("./packed-consumer-harness.mjs", import.meta.url).href;
  const harness = spawn(process.execPath, [
    "--input-type=module",
    "-e",
    `
      import { spawn } from "node:child_process";
      import { registerProcessCleanup } from ${JSON.stringify(harnessUrl)};
      const server = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
        detached: true,
        stdio: "ignore",
      });
      registerProcessCleanup(server);
      server.once("spawn", () => process.send(server.pid));
      setInterval(() => {}, 1000);
    `,
  ], { stdio: ["ignore", "ignore", "ignore", "ipc"] });
  let serverPid;

  try {
    [serverPid] = await once(harness, "message");
    harness.kill("SIGINT");
    const [code, signal] = await once(harness, "exit");

    expect({ code, signal }).toEqual({ code: null, signal: "SIGINT" });
    expect(await waitForProcessToDisappear(serverPid, 1_000)).toBe(true);
  } finally {
    if (serverPid !== undefined) killProcessGroup(serverPid);
    if (harness.exitCode === null && harness.signalCode === null) harness.kill("SIGKILL");
  }
});

function killProcessGroup(pid) {
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
  }
}

async function waitForProcessToDisappear(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ESRCH") return true;
      throw error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  return false;
}
