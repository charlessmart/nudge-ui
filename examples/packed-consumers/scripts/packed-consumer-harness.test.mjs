import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import {
  appendDiagnostic,
  PACKED_CONSUMER_MATRIX,
  stopProcess,
} from "./packed-consumer-harness.mjs";

const fixturesRoot = fileURLToPath(new URL("../fixtures", import.meta.url));

function readFixtureDependencies(consumer) {
  const manifestPath = join(fixturesRoot, consumer.fixture, consumer.installDirectory ?? ".", "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return { ...manifest.dependencies, ...manifest.devDependencies };
}

function splitVersionLabel(label) {
  const separator = label.lastIndexOf("@");
  if (separator <= 0) return null;
  return { packageName: label.slice(0, separator), version: label.slice(separator + 1) };
}

test("the matrix declares one uniquely named entry per compatibility seam", () => {
  const adapters = PACKED_CONSUMER_MATRIX.map((consumer) => consumer.adapter);

  expect(adapters).toHaveLength(7);
  expect(new Set(adapters).size).toBe(adapters.length);
});

test("the matrix keeps its framework, React major, and package-manager coverage", () => {
  const packageManagers = [...new Set(PACKED_CONSUMER_MATRIX.map((consumer) => consumer.packageManager))].sort();
  const topologies = new Set(PACKED_CONSUMER_MATRIX.map((consumer) => consumer.topology));
  const reactMajors = [...new Set(PACKED_CONSUMER_MATRIX
    .map((consumer) => consumer.reactVersion?.split(".")[0])
    .filter(Boolean))].sort();

  expect(packageManagers).toEqual(["npm", "pnpm"]);
  expect(topologies).toContain("monorepo");
  expect(reactMajors).toEqual(["18", "19"]);
});

test("every pinned matrix version matches its fixture manifest", () => {
  const nonPackageLabels = new Set(["static-html"]);
  const mismatches = [];
  let comparedPins = 0;

  for (const consumer of PACKED_CONSUMER_MATRIX) {
    const dependencies = readFixtureDependencies(consumer);
    const pins = [
      { field: "frameworkVersion", label: consumer.frameworkVersion, packageName: null },
      { field: "reactVersion", label: consumer.reactVersion, packageName: "react" },
      { field: "structuralChildLibrary", label: consumer.structuralChildLibrary, packageName: null },
    ];

    for (const { field, label, packageName } of pins) {
      if (label === null || label === undefined) continue;
      const pin = packageName === null ? splitVersionLabel(label) : { packageName, version: label };
      if (pin === null) {
        if (!nonPackageLabels.has(label)) {
          mismatches.push(`${consumer.adapter} ${field}: "${label}" is neither a package@version label nor a known marker`);
        }
        continue;
      }
      comparedPins += 1;
      const actual = dependencies[pin.packageName];
      if (actual !== pin.version) {
        mismatches.push(`${consumer.adapter} ${field}: matrix declares ${pin.packageName}@${pin.version}, fixture declares ${pin.packageName}@${actual ?? "nothing"}`);
      }
    }
  }

  expect(comparedPins).toBeGreaterThan(0);
  expect(mismatches).toEqual([]);
});

test("appendDiagnostic preserves messages split across stream chunks", () => {
  const diagnostics = { server: "", browser: "" };
  appendDiagnostic(diagnostics, "server", 'Could not resolve "virtual:design-');
  appendDiagnostic(diagnostics, "server", 'tokens"');

  expect(diagnostics.server).toBe('Could not resolve "virtual:design-tokens"');
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
