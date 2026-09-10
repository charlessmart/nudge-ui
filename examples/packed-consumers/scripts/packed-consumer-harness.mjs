import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { cpSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const suiteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(suiteRoot, "../..");
const playwrightCli = fileURLToPath(import.meta.resolve("@playwright/test/cli"));
const adapterPackages = {
  astro: "@nudge-ui/astro",
  nextjs: "@nudge-ui/nextjs",
  standalone: "@nudge-ui/standalone",
  "vite-react": "@nudge-ui/vite-react",
};

const consumers = [
  {
    adapter: "vite-react",
    fixture: "vite-react",
    port: 5611,
    start: (port) => [
      "npm",
      ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    ],
  },
  {
    adapter: "astro",
    fixture: "astro",
    port: 5612,
    start: (port) => [
      "npm",
      ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port)],
    ],
    expectedMountFailure: {
      source: "server",
      pattern: /Could not resolve "virtual:design-tokens"/,
    },
  },
  {
    adapter: "nextjs",
    fixture: "nextjs",
    port: 5613,
    start: (port) => [
      "npm",
      ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)],
    ],
  },
  {
    adapter: "standalone",
    fixture: "standalone",
    port: 5614,
    start: (port) => [
      join("node_modules", ".bin", "nudge-ui"),
      ["serve", "prototype", "--host", "127.0.0.1", "--port", String(port)],
    ],
  },
];

class MountError extends Error {
  constructor(message, diagnostics, options) {
    super(message, options);
    this.diagnostics = diagnostics;
  }
}

export async function runPackedConsumerSuite(selectedAdapterNames = []) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "nudge-ui-packed-consumers-"));
  const tarballRoot = join(temporaryRoot, "packages");
  let registry;

  try {
    packPackages(tarballRoot);
    const packages = readPackedPackages(tarballRoot);
    registry = await startRegistry(packages);
    const selectedConsumers = selectConsumers(selectedAdapterNames);
    const failures = [];

    for (const consumer of selectedConsumers) {
      try {
        await runConsumer(consumer, packages, registry.url, temporaryRoot);
        if (consumer.expectedMountFailure) {
          reportWarning(
            `XPASS ${consumer.adapter}`,
            "Packed adapter mounted successfully. Remove its stale expected-failure allowance.",
          );
        }
      } catch (error) {
        if (
          error instanceof MountError
          && consumer.expectedMountFailure
          && matchesExpectedMountFailure(consumer.expectedMountFailure, error.diagnostics)
        ) {
          reportWarning(
            `XFAIL ${consumer.adapter}`,
            "Known packed-adapter virtual:design-tokens resolution failure reproduced.",
          );
          continue;
        }

        const message = error instanceof Error ? error.message : String(error);
        failures.push(new Error(`${consumer.adapter}: ${message}`, { cause: error }));
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(failures, "Packed consumer smoke tests failed.");
    }
  } finally {
    await registry?.close();
    rmSync(temporaryRoot, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
}

export function matchesExpectedMountFailure(expectedFailure, diagnostics) {
  return expectedFailure.pattern.test(diagnostics[expectedFailure.source].join("\n"));
}

function selectConsumers(selectedAdapterNames) {
  const selectedAdapters = new Set(selectedAdapterNames);
  const selectedConsumers = selectedAdapters.size === 0
    ? consumers
    : consumers.filter((consumer) => selectedAdapters.has(consumer.adapter));
  if (selectedConsumers.length === 0) {
    throw new Error(`Select one or more adapters: ${consumers.map((consumer) => consumer.adapter).join(", ")}.`);
  }
  return selectedConsumers;
}

function packPackages(outputDirectory) {
  run("pnpm", ["run", "build:packages"], repositoryRoot);
  run("node", ["scripts/verify-packages.mjs", "--output-directory", outputDirectory], repositoryRoot);
}

function readPackedPackages(directory) {
  return new Map(readdirSync(directory).filter((entry) => entry.endsWith(".tgz")).map((entry) => {
    const tarball = join(directory, entry);
    const manifest = JSON.parse(execFileSync("tar", ["-xOf", tarball, "package/package.json"], { encoding: "utf8" }));
    return [manifest.name, { manifest, tarball }];
  }));
}

async function runConsumer(consumer, packages, registryUrl, temporaryRoot) {
  const projectRoot = join(temporaryRoot, consumer.fixture);
  cpSync(join(suiteRoot, "fixtures", consumer.fixture), projectRoot, { recursive: true });
  const manifestPath = join(projectRoot, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.devDependencies = {
    ...manifest.devDependencies,
    "create-nudge-ui": `file:${packages.get("create-nudge-ui").tarball}`,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(projectRoot, ".npmrc"), `@nudge-ui:registry=${registryUrl}\n`);

  await runAsync("npm", ["install", "--no-audit", "--no-fund"], projectRoot);
  await runAsync(
    join(projectRoot, "node_modules", ".bin", "create-nudge-ui"),
    ["--framework", consumer.adapter, "--package-manager", "npm"],
    projectRoot,
  );
  const installedAdapter = join(projectRoot, "node_modules", ...adapterPackages[consumer.adapter].split("/"));
  if (lstatSync(installedAdapter).isSymbolicLink()) {
    throw new Error(`${consumer.adapter} resolved to a workspace link instead of an installed package.`);
  }

  const diagnostics = { server: [], browser: [] };
  const [command, args] = consumer.start(consumer.port);
  const server = spawn(command, args, {
    cwd: projectRoot,
    detached: true,
    env: { ...process.env, NODE_ENV: "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => {
    const message = chunk.toString();
    diagnostics.server.push(message);
    process.stdout.write(`[${consumer.adapter}] ${message}`);
  });
  server.stderr.on("data", (chunk) => {
    const message = chunk.toString();
    diagnostics.server.push(message);
    process.stderr.write(`[${consumer.adapter}] ${message}`);
  });

  try {
    const url = `http://127.0.0.1:${consumer.port}/`;
    await waitForUrl(url, server);
    try {
      await runBrowserSmoke(consumer.adapter, url, diagnostics.browser);
    } catch (error) {
      throw new MountError(
        `${consumer.adapter} did not mount from its packed adapter.\n${formatDiagnostics(diagnostics)}`,
        diagnostics,
        { cause: error },
      );
    }
    process.stdout.write(`PASS ${consumer.adapter}: packed adapter installed and mounted.\n`);
  } finally {
    await stopProcess(server);
  }
}

function runBrowserSmoke(adapter, url, browserDiagnostics) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [
      playwrightCli,
      "test",
      "--config",
      join(suiteRoot, "playwright.config.ts"),
    ], {
      cwd: suiteRoot,
      env: {
        ...process.env,
        NUDGE_UI_PACKED_ADAPTER: adapter,
        NUDGE_UI_PACKED_URL: url,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => {
      const message = chunk.toString();
      browserDiagnostics.push(message);
      process.stdout.write(`[${adapter}:browser] ${message}`);
    });
    child.stderr.on("data", (chunk) => {
      const message = chunk.toString();
      browserDiagnostics.push(message);
      process.stderr.write(`[${adapter}:browser] ${message}`);
    });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(new Error(`Playwright exited with ${signal ?? `code ${code}`}.`));
    });
  });
}

async function startRegistry(packages) {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://registry.local").pathname;
    if (path.startsWith("/tarballs/")) {
      const file = packages.get(decodeURIComponent(basename(path)))?.tarball;
      if (!file) return sendJson(response, 404, { error: "Package tarball not found." });
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.end(readFileSync(file));
      return;
    }

    const name = decodeURIComponent(path.slice(1));
    const packed = packages.get(name);
    if (!packed) return sendJson(response, 404, { error: `Package ${name} not found.` });
    const bytes = readFileSync(packed.tarball);
    const version = packed.manifest.version;
    const tarballUrl = `${registry.url}/tarballs/${encodeURIComponent(name)}`;
    sendJson(response, 200, {
      name,
      "dist-tags": { latest: version },
      versions: {
        [version]: {
          ...packed.manifest,
          dist: {
            integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
            shasum: createHash("sha1").update(bytes).digest("hex"),
            tarball: tarballUrl,
          },
        },
      },
    });
  });

  const registry = { url: "", close: () => new Promise((resolveClose) => server.close(resolveClose)) };
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start the package registry.");
  registry.url = `http://127.0.0.1:${address.port}`;
  return registry;
}

async function waitForUrl(url, processHandle) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null || processHandle.signalCode !== null) {
      throw new Error(`Development server exited with ${processHandle.signalCode ?? `code ${processHandle.exitCode}`}.`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server has not started listening yet.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

export async function stopProcess(
  processHandle,
  { terminateTimeoutMs = 5_000, killTimeoutMs = 5_000 } = {},
) {
  const currentExit = processExit(processHandle);
  if (currentExit) return currentExit;
  if (processHandle.pid === undefined) throw new Error("Development server has no process ID.");

  const exited = new Promise((resolveExit) => {
    processHandle.once("exit", (code, signal) => resolveExit({ code, signal }));
  });
  signalProcessGroup(processHandle.pid, "SIGTERM");
  const gracefulExit = await waitForExit(exited, terminateTimeoutMs);
  if (gracefulExit) return gracefulExit;

  signalProcessGroup(processHandle.pid, "SIGKILL");
  const forcedExit = await waitForExit(exited, killTimeoutMs);
  if (forcedExit) return forcedExit;

  const finalExit = processExit(processHandle);
  if (finalExit) return finalExit;
  throw new Error(`Development server process group ${processHandle.pid} did not exit after SIGKILL.`);
}

function signalProcessGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
  }
}

function processExit(processHandle) {
  if (processHandle.exitCode === null && processHandle.signalCode === null) return null;
  return { code: processHandle.exitCode, signal: processHandle.signalCode };
}

async function waitForExit(exitPromise, timeoutMs) {
  let timeout;
  try {
    return await Promise.race([
      exitPromise,
      new Promise((resolveTimeout) => {
        timeout = setTimeout(() => resolveTimeout(null), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function reportWarning(title, message) {
  process.stdout.write(`::warning title=${title}::${escapeWorkflowData(message)}\n`);
}

function escapeWorkflowData(value) {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

function formatDiagnostics(diagnostics) {
  return [
    "Server diagnostics:",
    diagnostics.server.join("\n"),
    "Browser diagnostics:",
    diagnostics.browser.join("\n"),
  ].join("\n");
}

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, env: process.env, stdio: "inherit" });
}

function runAsync(command, args, cwd) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: "inherit" });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(new Error(`${command} exited with ${signal ?? `code ${code}`}.`));
    });
  });
}

function sendJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}
