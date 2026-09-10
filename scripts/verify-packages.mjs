/**
 * Verify the publication boundary without contacting a registry.
 *
 * `pnpm package:verify` builds the packages once before this script packs them
 * without rerunning lifecycle scripts. This script then checks the exact
 * tarball contents and the package metadata that a clean consumer will resolve.
 * Keeping this as a local command makes release regressions visible before a
 * version is published.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const repositoryRoot = resolve(new URL("..", import.meta.url).pathname);
const packageDirectories = [
  "agent-protocol",
  "create-nudge-ui",
  "css",
  "inspector",
  "plugin",
  "astro",
  "nextjs",
  "standalone",
  "mcp",
];
const outputArgument = process.argv.indexOf("--output-directory");
const retainedOutput = outputArgument !== -1;
const requestedOutput = retainedOutput ? process.argv[outputArgument + 1] : undefined;
if (retainedOutput && !requestedOutput) {
  throw new Error("--output-directory requires a path.");
}

const outputDirectory = requestedOutput
  ? resolve(repositoryRoot, requestedOutput)
  : mkdtempSync(join(tmpdir(), "nudge-ui-packages-"));

if (retainedOutput) {
  mkdirSync(outputDirectory, { recursive: true });
  assert(readdirSync(outputDirectory).length === 0, `${outputDirectory} must be empty.`);
}

try {
  for (const directory of packageDirectories) {
    verifyPackage(resolve(repositoryRoot, "packages", directory));
  }
  if (process.argv.includes("--install-consumers")) verifyPackedAstroConsumers();
  console.log(`Verified ${packageDirectories.length} publishable packages.`);
} finally {
  if (!retainedOutput) rmSync(outputDirectory, { recursive: true, force: true });
}

function verifyPackage(packageRoot) {
  const before = new Set(readdirSync(outputDirectory));
  const result = spawnSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["pack", "--pack-destination", outputDirectory, "--silent"],
    {
      cwd: packageRoot,
      encoding: "utf8",
      env: { ...process.env, npm_config_ignore_scripts: "true" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${packageRoot} pack failed:\n${result.stdout}${result.stderr}`);
  }

  const tarballs = readdirSync(outputDirectory).filter((entry) => entry.endsWith(".tgz") && !before.has(entry));
  if (tarballs.length !== 1) {
    throw new Error(`${packageRoot} did not produce exactly one tarball.`);
  }
  const tarball = join(outputDirectory, tarballs[0]);
  const entries = tarEntries(tarball);
  const packageJson = JSON.parse(tarFile(tarball, "package/package.json"));

  assert(entries.includes("package/dist/LICENSE"), `${packageJson.name} is missing its MIT license text.`);
  assert(entries.every((entry) => !entry.startsWith("package/src/")), `${packageJson.name} ships source files.`);
  assert(entries.every((entry) => !/(^|\/)(?:.*\.)?(?:test|spec)\.[cm]?[jt]sx?$/.test(entry)), `${packageJson.name} ships tests.`);
  assert(entries.every((entry) => !entry.endsWith(".map")), `${packageJson.name} ships source maps.`);
  assert(entries.every((entry) => !entry.startsWith("package/node_modules/")), `${packageJson.name} ships dependencies.`);
  assert(packageJson.license === "MIT", `${packageJson.name} must declare MIT licensing.`);
  assert(packageJson.publishConfig?.access === "public", `${packageJson.name} must publish with public access.`);
  assert(packageJson.engines?.node, `${packageJson.name} must declare a Node engine.`);
  assert(!JSON.stringify(packageJson).includes("workspace:"), `${packageJson.name} retains a workspace dependency.`);

  assertPackageTarget(entries, packageJson.main, `${packageJson.name} main`);
  assertPackageTarget(entries, packageJson.types, `${packageJson.name} types`);
  for (const [subpath, target] of Object.entries(packageJson.exports ?? {})) {
    for (const path of targetPaths(target)) assertPackageTarget(entries, path, `${packageJson.name} export ${subpath}`);
  }
  for (const [name, target] of Object.entries(packageJson.bin ?? {})) {
    assert(target.startsWith("./dist/"), `${packageJson.name} bin ${name} must point into dist.`);
    assertPackageTarget(entries, target, `${packageJson.name} bin ${name}`);
  }

  if (packageJson.name === "@nudge-ui/nextjs") {
    for (const loader of ["loader-plugin.cjs", "identity-loader.cjs", "css-inline-loader.cjs"]) {
      assert(entries.includes(`package/dist/loaders/${loader}`), `Next.js package is missing dist/loaders/${loader}.`);
    }
  }
  if (packageJson.name === "@nudge-ui/inspector") {
    const clientPath = "package/dist/client.mjs";
    assert(entries.includes(clientPath), "Inspector package is missing its self-contained client.");
    const client = tarFile(tarball, clientPath);
    assert(
      !/^\s*import\s/m.test(client),
      "Inspector client contains an external module import.",
    );
  }
  if (packageJson.name === "@nudge-ui/mcp") {
    assert(!entries.includes("package/scripts/postinstall.mjs"), "MCP package must not ship an install-time postinstall script.");
    assert(!entries.some((entry) => entry === "package/dist/registrar.mjs"), "MCP package must not ship the obsolete registrar artifact.");
    assert(!Object.prototype.hasOwnProperty.call(packageJson.exports ?? {}, "./registrar"), "MCP package must not export the obsolete registrar API.");
  }

  console.log(`  ${packageJson.name}@${packageJson.version}: ${entries.length} files`);
}

/**
 * Installs the packed package graph into React 18 and React 19 consumers.
 *
 * This catches workspace-link behavior that package-level tests cannot see,
 * including missing exported files and peer-resolution assumptions. The
 * This optional networked check is enabled with `--install-consumers`; the
 * default package verifier remains registry-independent.
 */
function verifyPackedAstroConsumers() {
  const tarballs = new Map();
  for (const entry of readdirSync(outputDirectory).filter((name) => name.endsWith(".tgz"))) {
    const tarball = join(outputDirectory, entry);
    const packageJson = JSON.parse(tarFile(tarball, "package/package.json"));
    tarballs.set(packageJson.name, tarball);
  }
  const requiredPackages = [
    "@nudge-ui/agent-protocol",
    "@nudge-ui/css",
    "@nudge-ui/inspector",
    "@nudge-ui/vite-react",
    "@nudge-ui/astro",
  ];
  for (const packageName of requiredPackages) {
    assert(tarballs.has(packageName), `Packed Astro verification is missing ${packageName}.`);
  }

  for (const reactVersion of ["18.3.1", "19.2.8"]) {
    const consumerRoot = mkdtempSync(join(tmpdir(), `nudge-ui-astro-react-${reactVersion[0]}-`));
    try {
      const localPackages = Object.fromEntries(requiredPackages.map((packageName) => [
        packageName,
        `file:${tarballs.get(packageName)}`,
      ]));
      writeFileSync(join(consumerRoot, "package.json"), JSON.stringify({
        name: `packed-astro-react-${reactVersion[0]}`,
        private: true,
        type: "module",
        dependencies: {
          ...localPackages,
          astro: "7.2.10",
          react: reactVersion,
          "react-dom": reactVersion,
          vite: "7.3.6",
        },
        pnpm: { overrides: localPackages },
      }, null, 2));
      writeFileSync(join(consumerRoot, "verify.mjs"), [
        'import { withNudgeUi } from "@nudge-ui/astro";',
        'const integrations = [{ name: "existing", hooks: {} }];',
        "const input = { integrations };",
        "const output = withNudgeUi(input);",
        'if (input.integrations.length !== 1) throw new Error("withNudgeUi mutated its input.");',
        'if (output.integrations.length !== 2) throw new Error("withNudgeUi did not append the Adapter.");',
        'if (output.integrations[1]?.name !== "nudge-ui") throw new Error("Astro Adapter is missing.");',
      ].join("\n"));
      runChecked(
        process.platform === "win32" ? "pnpm.cmd" : "pnpm",
        ["install", "--ignore-scripts", "--config.auto-install-peers=false"],
        consumerRoot,
      );
      runChecked(process.execPath, ["verify.mjs"], consumerRoot);
      console.log(`  packed Astro consumer: React ${reactVersion}`);
    } finally {
      rmSync(consumerRoot, { recursive: true, force: true });
    }
  }
}

function runChecked(executable, args, cwd) {
  const result = spawnSync(executable, args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${executable} ${args.join(" ")} failed:\n${result.stdout}${result.stderr}`);
  }
}

function tarEntries(tarball) {
  return execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
}

function tarFile(tarball, path) {
  return execFileSync("tar", ["-xOf", tarball, path], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function targetPaths(target) {
  if (typeof target === "string") return [target];
  if (!target || typeof target !== "object") return [];
  return Object.values(target).filter((value) => typeof value === "string");
}

function assertPackageTarget(entries, target, label) {
  if (typeof target !== "string") return;
  const normalized = `package/${target.replace(/^\.\//, "")}`;
  assert(entries.includes(normalized), `${label} points to missing ${target}.`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
