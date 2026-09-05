#!/usr/bin/env node

/**
 * Verify how Codex CLI launches a STDIO MCP child.
 *
 * Each case uses Codex's per-invocation config overrides and a temporary
 * workspace. The fake MCP server records its cwd, initialize, and tools/list;
 * it intentionally does not answer tools/list, so Codex cannot advance to a
 * model turn before the probe stops it.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const codexCommand = process.env.CODEX_COMMAND ?? "codex";

const fakeServerSource = String.raw`#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

const eventLogPath = process.argv[2];

function record(event, details = {}) {
  appendFileSync(eventLogPath, JSON.stringify({ event, ...details }) + "\n");
}

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

record("started", { pid: process.pid, cwd: process.cwd(), argv: process.argv.slice(2) });

const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  if (line.trim() === "") return;

  let message;
  try {
    message = JSON.parse(line);
  } catch {
    record("invalid_input", { line });
    return;
  }

  const method = typeof message.method === "string" ? message.method : "";
  if (method === "initialize") {
    record("request", { method });
    reply(message.id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "codex-cwd-probe", version: "0.0.0" },
      instructions: "This probe only verifies the host launch cwd.",
    });
    return;
  }

  if (method === "tools/list") {
    record("request", { method });
    // Intentionally leave this request pending. The parent probe terminates
    // Codex after this event, before the host can start a model turn.
    record("ready");
    return;
  }

  record("request", { method });
});

process.stdin.on("close", () => process.exit(0));
`;

function configOverride(key, value) {
  return `mcp_servers.cwd_probe.${key}=${JSON.stringify(value)}`;
}

function readEvents(eventLogPath) {
  if (!existsSync(eventLogPath)) return [];
  return readFileSync(eventLogPath, "utf8")
    .split("\n")
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }

    const timer = setTimeout(resolve, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function stopChild(child) {
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGINT");
  await waitForExit(child, 750);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  await waitForExit(child, 750);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  await waitForExit(child, 750);
}

function stopRecordedProcess(pid) {
  if (typeof pid !== "number") return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // The MCP child normally exits when Codex closes its stdio pipe.
  }
}

function safeRead(stream) {
  return stream.replaceAll("\u001b", "");
}

function samePath(left, right) {
  if (!left || !right) return false;
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return left === right;
  }
}

async function runCase(name, includeMcpCwd) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), `nudge-codex-mcp-cwd-${name}-`));
  const serverPath = join(temporaryRoot, "fake-mcp-server.mjs");
  const eventLogPath = join(temporaryRoot, "events.ndjson");
  const codexHome = join(temporaryRoot, "codex-home");
  const taskCwd = join(temporaryRoot, "task-cwd");
  const serverCwd = join(temporaryRoot, "server-cwd");
  mkdirSync(codexHome);
  mkdirSync(taskCwd);
  mkdirSync(serverCwd);
  writeFileSync(serverPath, fakeServerSource, { mode: 0o700 });

  let codex = null;
  let spawnError = null;
  let childStopped = false;
  let launchPid;
  let stdout = "";
  let stderr = "";

  try {
    const args = [
      "exec",
      "--ignore-user-config",
      "--ephemeral",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "--ignore-rules",
      "--disable",
      "plugins",
      "-C",
      taskCwd,
      "-c",
      configOverride("command", process.execPath),
      "-c",
      `mcp_servers.cwd_probe.args=${JSON.stringify([serverPath, eventLogPath])}`,
      "-c",
      configOverride("startup_timeout_sec", 2),
      "-c",
      configOverride("required", true),
      "--json",
      "Do not take any action. Reply with exactly OK.",
    ];
    if (includeMcpCwd) args.splice(args.length - 2, 0, "-c", configOverride("cwd", serverCwd));

    try {
      codex = spawn(codexCommand, args, {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          CODEX_HOME: codexHome,
          PATH: [process.env.PATH, "/opt/homebrew/bin", "/usr/local/bin"].filter(Boolean).join(delimiter),
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      codex.on("error", (error) => { spawnError = error; });
      codex.stdout.setEncoding("utf8");
      codex.stderr.setEncoding("utf8");
      codex.stdout.on("data", (chunk) => { stdout += chunk; });
      codex.stderr.on("data", (chunk) => { stderr += chunk; });
    } catch (error) {
      spawnError = error;
    }

    let outcome = spawnError ? "codex-spawn-error" : "timeout";
    const deadline = Date.now() + 7_500;
    while (codex && !spawnError && Date.now() < deadline) {
      const events = readEvents(eventLogPath);
      if (events.some((event) => event.event === "ready")) {
        outcome = "mcp-tools-list-requested";
        break;
      }
      if (codex.exitCode !== null || codex.signalCode !== null) {
        outcome = "codex-exited-before-mcp-ready";
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    if (codex && (outcome === "timeout" || outcome === "mcp-tools-list-requested")) {
      await stopChild(codex);
      childStopped = true;
    }

    const events = readEvents(eventLogPath);
    const launch = events.find((event) => event.event === "started");
    launchPid = launch?.pid;
    const methods = events.filter((event) => event.event === "request").map((event) => event.method);
    const result = {
      name,
      outcome,
      parentSpawnCwd: repositoryRoot,
      taskCwd,
      serverCwd,
      configuredMcpCwd: includeMcpCwd ? serverCwd : null,
      observedCwd: launch?.cwd ?? null,
      observedCwdCanonical: launch?.cwd ? realpathSync(launch.cwd) : null,
      observedMethods: methods,
      toolsListReplyWithheld: true,
      cwdMatchesExplicitConfig: includeMcpCwd ? samePath(launch?.cwd, serverCwd) : null,
      inheritedCwdSource: includeMcpCwd
        ? null
        : samePath(launch?.cwd, taskCwd)
          ? "codex-task-cwd"
          : samePath(launch?.cwd, repositoryRoot)
            ? "parent-spawn-cwd"
            : "other",
      spawnError: spawnError instanceof Error ? spawnError.message : spawnError ? String(spawnError) : null,
      stdout: safeRead(stdout).slice(-2_000),
      stderr: safeRead(stderr).slice(-2_000),
    };

    return result;
  } finally {
    if (codex && !childStopped) {
      try {
        await stopChild(codex);
      } catch {
        // Cleanup continues even if Codex exits during error handling.
      }
    }
    stopRecordedProcess(launchPid);
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

const results = [
  await runCase("explicit", true),
  await runCase("inherited", false),
];

process.stdout.write(`${JSON.stringify({
  cli: codexCommand,
  cases: results,
  allMcpHandshakesObserved: results.every((result) => result.observedMethods.includes("initialize") && result.observedMethods.includes("tools/list")),
  explicitCwdMatched: results[0].cwdMatchesExplicitConfig === true,
  inheritedCwdMatchedTask: results[1].inheritedCwdSource === "codex-task-cwd",
}, null, 2)}\n`);

const explicitCase = results.find((result) => result.name === "explicit");
const inheritedCase = results.find((result) => result.name === "inherited");
const handshakeObserved = (result) => result?.observedMethods.includes("initialize") && result.observedMethods.includes("tools/list");

if (
  !explicitCase
  || !inheritedCase
  || explicitCase.cwdMatchesExplicitConfig !== true
  || inheritedCase.inheritedCwdSource !== "codex-task-cwd"
  || !handshakeObserved(explicitCase)
  || !handshakeObserved(inheritedCase)
  || results.some((result) => result.outcome !== "mcp-tools-list-requested" || result.observedMethods.includes("tools/call"))
) {
  process.exitCode = 1;
}
