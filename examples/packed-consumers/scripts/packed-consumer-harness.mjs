import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { cpSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const suiteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(suiteRoot, "../..");
const maxDiagnosticCharacters = 256_000;
const upstreamRegistry = "https://registry.npmjs.org";
/** Every host installs the same distribution package and reaches its host through a subpath. */
const distributionPackage = "nudge-ui";

/**
 * The packed compatibility matrix deliberately varies one seam at a time:
 * minimum/current framework versions, React major, package manager, project
 * topology, callback configuration, and a structural-child library.
 */
export const PACKED_CONSUMER_MATRIX = [
  {
    adapter: "vite-react",
    fixture: "vite-react",
    frameworkVersion: "vite@6.4.3",
    reactVersion: "18.3.1",
    packageManager: "npm",
    topology: "flat",
    port: 5611,
    start: (port) => [
      "npm",
      ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    ],
  },
  {
    adapter: "astro",
    fixture: "astro",
    frameworkVersion: "astro@5.18.2",
    reactVersion: "18.3.1",
    packageManager: "npm",
    topology: "flat",
    port: 5612,
    start: (port) => [
      "npm",
      ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port)],
    ],
  },
  {
    adapter: "nextjs",
    fixture: "nextjs",
    frameworkVersion: "next@16.3.4",
    reactVersion: "19.2.8",
    packageManager: "npm",
    topology: "flat",
    port: 5613,
    start: (port) => [
      "npm",
      ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)],
    ],
  },
  {
    adapter: "nextjs-16.1",
    installerFramework: "nextjs",
    fixture: "nextjs-16-1",
    frameworkVersion: "next@16.1.0",
    reactVersion: "19.2.8",
    packageManager: "npm",
    topology: "flat",
    port: 5615,
    start: (port) => [
      "npm",
      ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)],
    ],
  },
  {
    adapter: "standalone",
    fixture: "standalone",
    frameworkVersion: "static-html",
    reactVersion: null,
    packageManager: "npm",
    topology: "flat",
    port: 5614,
    start: (port) => [
      join("node_modules", ".bin", "nudge-ui"),
      ["serve", "prototype", "--host", "127.0.0.1", "--port", String(port)],
    ],
  },
  {
    adapter: "vite-react-current",
    installerFramework: "vite-react",
    fixture: "vite-react-current",
    frameworkVersion: "vite@8.2.2",
    reactVersion: "19.2.8",
    packageManager: "npm",
    topology: "flat",
    structuralChildLibrary: "react-router-dom@7.18.3",
    expectedApplicationText: "Packed Vite React current consumer",
    port: 5616,
    start: (port) => [
      "npm",
      ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    ],
  },
  {
    adapter: "vite-react-monorepo",
    installerFramework: "vite-react",
    fixture: "vite-react-monorepo",
    frameworkVersion: "vite@8.2.2",
    reactVersion: "19.2.8",
    packageManager: "pnpm",
    topology: "monorepo",
    installDirectory: "apps/web",
    packageManagerRoot: ".",
    serverDirectory: "apps/web",
    expectedApplicationText: "Packed Vite React workspace consumer",
    port: 5617,
    start: (port) => [
      "pnpm",
      ["run", "dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    ],
  },
];

const consumers = PACKED_CONSUMER_MATRIX;

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
      } catch (error) {
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

export function appendDiagnostic(diagnostics, source, message) {
  diagnostics[source] = `${diagnostics[source]}${message}`.slice(-maxDiagnosticCharacters);
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
  runSync("pnpm", ["run", "build:packages"], repositoryRoot);
  runSync("node", ["scripts/verify-packages.mjs", "--output-directory", outputDirectory], repositoryRoot);
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
  const installDirectory = join(projectRoot, consumer.installDirectory ?? ".");
  const packageManagerRoot = join(projectRoot, consumer.packageManagerRoot ?? consumer.installDirectory ?? ".");
  const manifestPath = join(installDirectory, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const initializerPackage = packages.get("create-nudge-ui");
  if (!initializerPackage) throw new Error("The packed create-nudge-ui package is missing.");
  manifest.devDependencies = {
    ...manifest.devDependencies,
    "create-nudge-ui": `file:${initializerPackage.tarball}`,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  // The distribution package is unscoped, and npm only supports per-scope registries, so the
  // consumer resolves everything through the local registry and it proxies what it does not pack.
  const registryConfig = `registry=${registryUrl}\n`;
  writeFileSync(join(projectRoot, ".npmrc"), registryConfig);
  if (installDirectory !== projectRoot) writeFileSync(join(installDirectory, ".npmrc"), registryConfig);
  // Environment config outranks the project .npmrc, and the outer pnpm run exports npm_config_registry.
  const registryEnv = { ...process.env, npm_config_registry: registryUrl, NPM_CONFIG_REGISTRY: registryUrl };

  const packageManager = consumer.packageManager ?? "npm";
  const installArgs = packageManager === "pnpm"
    ? ["install", "--no-frozen-lockfile", "--ignore-scripts"]
    : ["install", "--no-audit", "--no-fund"];
  await runAsync(packageManager, installArgs, packageManagerRoot, registryEnv);
  const initializerCandidates = [
    join(installDirectory, "node_modules", ".bin", "create-nudge-ui"),
    join(projectRoot, "node_modules", ".bin", "create-nudge-ui"),
  ];
  const initializer = initializerCandidates.find((candidate) => lstatSync(candidate, { throwIfNoEntry: false }));
  if (!initializer) throw new Error(`The ${packageManager} install did not provide create-nudge-ui.`);
  await runAsync(
    initializer,
    ["--framework", consumer.installerFramework ?? consumer.adapter, "--package-manager", packageManager],
    installDirectory,
    registryEnv,
  );
  const adapterRoots = [installDirectory, projectRoot];
  const installedAdapter = adapterRoots
    .map((directory) => join(directory, "node_modules", distributionPackage))
    .find((candidate) => lstatSync(candidate, { throwIfNoEntry: false }));
  if (!installedAdapter) throw new Error(`${consumer.adapter} did not install ${distributionPackage}.`);
  if (lstatSync(installedAdapter).isSymbolicLink()) {
    const resolvedAdapter = realpathSync(installedAdapter);
    const resolvedProjectRoot = realpathSync(projectRoot);
    if (!resolvedAdapter.startsWith(`${resolvedProjectRoot}/`)) {
      throw new Error(`${consumer.adapter} resolved to a workspace link instead of an installed package (${resolvedAdapter}).`);
    }
  }

  const diagnostics = { server: "", browser: "" };
  const [command, args] = consumer.start(consumer.port);
  const serverDirectory = join(projectRoot, consumer.serverDirectory ?? ".");
  const server = spawn(command, args, {
    cwd: serverDirectory,
    detached: true,
    env: { ...process.env, NODE_ENV: "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => {
    const message = chunk.toString();
    appendDiagnostic(diagnostics, "server", message);
    process.stdout.write(`[${consumer.adapter}] ${message}`);
  });
  server.stderr.on("data", (chunk) => {
    const message = chunk.toString();
    appendDiagnostic(diagnostics, "server", message);
    process.stderr.write(`[${consumer.adapter}] ${message}`);
  });
  const serverCleanup = registerProcessCleanup(server);

  try {
    const url = `http://127.0.0.1:${consumer.port}/`;
    await waitForUrl(url, server);
    try {
      await runBrowserSmoke(consumer, url, diagnostics);
    } catch (error) {
      throw new Error(
        `${consumer.adapter} did not mount from its packed adapter.\n${formatDiagnostics(diagnostics)}`,
        { cause: error },
      );
    }
    process.stdout.write(`PASS ${consumer.adapter}: packed adapter installed and mounted.\n`);
  } finally {
    try {
      await serverCleanup.stop();
    } finally {
      serverCleanup.removeSignalHandlers();
    }
  }
}

function runBrowserSmoke(consumer, url, diagnostics) {
  const adapter = consumer.adapter;
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [
      resolvePlaywrightCli(),
      "test",
      "--config",
      join(suiteRoot, "playwright.config.ts"),
    ], {
      cwd: suiteRoot,
      env: {
        ...process.env,
        NUDGE_UI_PACKED_ADAPTER: adapter,
        NUDGE_UI_PACKED_URL: url,
        ...(consumer.expectedApplicationText
          ? { NUDGE_UI_PACKED_EXPECTED_TEXT: consumer.expectedApplicationText }
          : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => {
      const message = chunk.toString();
      appendDiagnostic(diagnostics, "browser", message);
      process.stdout.write(`[${adapter}:browser] ${message}`);
    });
    child.stderr.on("data", (chunk) => {
      const message = chunk.toString();
      appendDiagnostic(diagnostics, "browser", message);
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

function resolvePlaywrightCli() {
  return fileURLToPath(import.meta.resolve("@playwright/test/cli"));
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
    if (!packed) {
      response.writeHead(302, { location: `${upstreamRegistry}${request.url ?? "/"}` });
      response.end();
      return;
    }
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
      const ready = response.ok;
      await response.body?.cancel();
      if (ready) return;
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
  if (processHandle.pid === undefined) throw new Error("Development server has no process ID.");
  const pid = processHandle.pid;
  const currentExit = processExit(processHandle);
  if (currentExit && !processGroupExists(pid)) return currentExit;

  signalProcessGroup(pid, "SIGTERM");
  const gracefulExit = await waitForProcessGroupExit(processHandle, pid, terminateTimeoutMs);
  if (gracefulExit) return gracefulExit;

  signalProcessGroup(pid, "SIGKILL");
  const forcedExit = await waitForProcessGroupExit(processHandle, pid, killTimeoutMs);
  if (forcedExit) return forcedExit;

  const finalExit = processExit(processHandle);
  if (finalExit && !processGroupExists(pid)) return finalExit;
  throw new Error(`Development server process group ${pid} did not exit after SIGKILL.`);
}

export function registerProcessCleanup(processHandle) {
  let stopPromise;
  let terminationSignal;
  const stop = () => {
    stopPromise ??= stopProcess(processHandle);
    return stopPromise;
  };
  const repeatSignal = () => {
    if (processHandle.pid !== undefined) signalProcessGroup(processHandle.pid, "SIGKILL");
  };
  const handleSignal = (signal) => {
    if (terminationSignal) {
      repeatSignal();
      return;
    }
    terminationSignal = signal;
    const terminateHarness = () => {
      removeSignalHandlers();
      process.kill(process.pid, signal);
    };
    void stop().then(terminateHarness, terminateHarness);
  };
  const handleInterrupt = () => handleSignal("SIGINT");
  const handleTermination = () => handleSignal("SIGTERM");
  const removeSignalHandlers = () => {
    process.off("SIGINT", handleInterrupt);
    process.off("SIGTERM", handleTermination);
  };

  process.on("SIGINT", handleInterrupt);
  process.on("SIGTERM", handleTermination);
  return { removeSignalHandlers, stop };
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

function processGroupExists(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") return false;
    if (error instanceof Error && "code" in error && error.code === "EPERM") return true;
    throw error;
  }
}

async function waitForProcessGroupExit(processHandle, pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  do {
    const exit = processExit(processHandle);
    if (exit && !processGroupExists(pid)) return exit;
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  } while (Date.now() < deadline);
  return null;
}

function formatDiagnostics(diagnostics) {
  return [
    "Server diagnostics:",
    diagnostics.server,
    "Browser diagnostics:",
    diagnostics.browser,
  ].join("\n");
}

function runSync(command, args, cwd) {
  execFileSync(command, args, { cwd, env: process.env, stdio: "inherit" });
}

function runAsync(command, args, cwd, env = process.env) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit" });
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
