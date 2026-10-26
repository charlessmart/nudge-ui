import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";

const repositoryRoot = resolve(new URL("..", import.meta.url).pathname);
const packageDirectories = [
  "create-nudge-ui",
  "nudge-ui",
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
    assert(
      target.startsWith("./dist/") || target.startsWith("./bin/"),
      `${packageJson.name} bin ${name} must point into dist or bin.`,
    );
    assertPackageTarget(entries, target, `${packageJson.name} bin ${name}`);
  }

  if (packageJson.name === "nudge-ui") {
    const expectedExports = [
      "./vite",
      "./next",
      "./astro",
      "./static",
      "./testing",
      "./virtual-design-tokens",
      "./internal/client",
      "./internal/inspector",
      "./internal/component-runtime",
      "./internal/host-runtime",
      "./internal/page-inspector",
      "./internal/cursor-images",
      "./internal/next/mount",
    ];
    const actualExports = Object.keys(packageJson.exports ?? {});
    assert(
      actualExports.length === expectedExports.length
        && expectedExports.every((subpath) => actualExports.includes(subpath)),
      `nudge-ui export surface changed: ${actualExports.join(", ")}.`,
    );
    for (const loader of ["loader-plugin.cjs", "identity-loader.cjs"]) {
      const path = `package/dist/hosts/next/loaders/${loader}`;
      assert(entries.includes(path), `nudge-ui is missing ${path}.`);
    }
    assert(
      !entries.some((entry) => entry.endsWith("/css-inline-loader.cjs")),
      "nudge-ui must not publish the obsolete CSS query loader.",
    );
    assert(entries.includes("package/bin/nudge-ui.mjs"), "nudge-ui is missing its CLI entry point.");
    assert(entries.includes("package/dist/nudge-ui.mjs"), "nudge-ui is missing its bundled CLI.");
    // The browser client is served over HTTP into pages that have no module resolution, so it must carry every dependency it needs.
    const clientPath = "package/dist/client.mjs";
    assert(entries.includes(clientPath), "nudge-ui is missing its self-contained inspector client.");
    const externalSpecifiers = externalModuleSpecifiers(tarFile(tarball, clientPath));
    assert(
      externalSpecifiers.length === 0,
      `Inspector client contains external module imports: ${externalSpecifiers.join(", ")}.`,
    );
    assert(
      !entries.includes("package/dist/inspector/client.js"),
      "nudge-ui contains a dead client.js emit alongside the bundled client.",
    );
    assert(
      !entries.includes("package/dist/inspector/client.d.ts"),
      "nudge-ui contains a dead client declaration emit alongside the bundled client.",
    );
  }
  console.log(`  ${packageJson.name}@${packageJson.version}: ${entries.length} files`);
}

function externalModuleSpecifiers(code) {
  const sourceFile = ts.createSourceFile("client.mjs", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const specifiers = [];
  visit(sourceFile);
  return specifiers;

  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = node.arguments[0];
      specifiers.push(argument && ts.isStringLiteral(argument)
        ? argument.text
        : "<dynamic import>");
    }
    ts.forEachChild(node, visit);
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
