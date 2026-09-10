import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { cpSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const suiteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(suiteRoot, "../..");
const temporaryRoot = mkdtempSync(join(tmpdir(), "nudge-ui-packed-consumers-"));
const tarballRoot = join(temporaryRoot, "packages");
const adapterPackages = {
  astro: "@nudge-ui/astro",
  nextjs: "@nudge-ui/nextjs",
  standalone: "@nudge-ui/standalone",
  "vite-react": "@nudge-ui/vite-react",
};

class MountError extends Error {}

const consumers = [
  {
    adapter: "vite-react",
    fixture: "vite-react",
    port: 5611,
    start: ["npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5611", "--strictPort"]],
  },
  {
    adapter: "astro",
    fixture: "astro",
    port: 5612,
    start: ["npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5612"]],
    expectedMountFailure: /virtual:design-tokens|does not provide an export named|createRoot|useSyncExternalStore/,
  },
  {
    adapter: "nextjs",
    fixture: "nextjs",
    port: 5613,
    start: ["npm", ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", "5613"]],
  },
  {
    adapter: "standalone",
    fixture: "standalone",
    port: 5614,
    start: [join("node_modules", ".bin", "nudge-ui"), ["serve", "prototype", "--host", "127.0.0.1", "--port", "5614"]],
  },
];

let registry;
try {
  packPackages(tarballRoot);
  const packages = readPackedPackages(tarballRoot);
  registry = await startRegistry(packages);
  const selectedAdapters = new Set(process.argv.slice(2).filter((argument) => argument !== "--"));
  const selectedConsumers = selectedAdapters.size === 0
    ? consumers
    : consumers.filter((consumer) => selectedAdapters.has(consumer.adapter));
  if (selectedConsumers.length === 0) {
    throw new Error(`Select one or more adapters: ${consumers.map((consumer) => consumer.adapter).join(", ")}.`);
  }
  const failures = [];
  for (const consumer of selectedConsumers) {
    try {
      await runConsumer(consumer, packages, registry.url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof MountError && consumer.expectedMountFailure?.test(message)) {
        process.stdout.write(`XFAIL ${consumer.adapter}: known packed-adapter mount failure reproduced.\n`);
      } else {
        failures.push(new Error(`${consumer.adapter}: ${message}`, { cause: error }));
      }
    }
  }
  if (failures.length > 0) throw new AggregateError(failures, "Packed consumer smoke tests failed.");
} finally {
  await registry?.close();
  rmSync(temporaryRoot, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
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

async function runConsumer(consumer, packages, registryUrl) {
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

  const logs = [];
  const [command, args] = consumer.start;
  const server = spawn(command, args, {
    cwd: projectRoot,
    detached: true,
    env: { ...process.env, NODE_ENV: "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => {
    logs.push(chunk.toString());
    process.stdout.write(`[${consumer.adapter}] ${chunk}`);
  });
  server.stderr.on("data", (chunk) => {
    const message = chunk.toString();
    logs.push(message);
    process.stderr.write(`[${consumer.adapter}] ${message}`);
  });

  try {
    const url = `http://127.0.0.1:${consumer.port}/`;
    await waitForUrl(url, server);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      page.on("console", (message) => {
        if (message.type() === "error") logs.push(`console: ${message.text()}`);
      });
      page.on("pageerror", (error) => logs.push(`page: ${error.message}`));
      await page.goto(url);
      try {
        await page.waitForFunction(() => {
          const host = document.getElementById("nudge-ui-root");
          return Boolean(host?.shadowRoot && window.__nudgeUi);
        }, undefined, { timeout: 30_000 });
      } catch (error) {
        throw new MountError(`${consumer.adapter} did not mount from its packed adapter.\n${logs.join("\n")}`, { cause: error });
      }
      process.stdout.write(`PASS ${consumer.adapter}: packed adapter installed and mounted.\n`);
    } finally {
      await browser.close();
    }
  } finally {
    await stopProcess(server);
  }
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

async function stopProcess(processHandle) {
  if (processHandle.exitCode !== null || processHandle.signalCode !== null) return;
  if (processHandle.pid === undefined) throw new Error("Development server has no process ID.");
  const exited = new Promise((resolveExit) => processHandle.once("exit", resolveExit));
  process.kill(-processHandle.pid, "SIGTERM");
  await exited;
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
