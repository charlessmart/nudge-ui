/**
 * Build one workspace package for publication.
 *
 * TypeScript owns the module/declaration emit so package sources can keep
 * their strict typecheck configuration. `rewriteRelativeImportExtensions`
 * turns authored `.ts`/`.tsx` references into runnable `.js` references in
 * both JavaScript and declarations. Inspector CSS is imported with Vite's
 * `?inline` convention; release output has no Vite transform, so those
 * imports are replaced with the stylesheet text after TypeScript emits.
 */
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const packageRoot = resolve(process.argv[2] ?? process.cwd());
const sourceRoot = resolve(packageRoot, "src");
const outputRoot = resolve(packageRoot, "dist");

if (!statSync(packageRoot, { throwIfNoEntry: false })?.isDirectory()) {
  throw new Error(`Package directory does not exist: ${packageRoot}`);
}
if (!statSync(sourceRoot, { throwIfNoEntry: false })?.isDirectory()) {
  throw new Error(`Package source directory does not exist: ${sourceRoot}`);
}

// A clean release build prevents ignored output from a previous source tree
// from surviving into a tarball.
rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const buildProject = createBuildProject(packageRoot, sourceRoot);
const result = spawnSync(
  pnpm,
  [
    "exec",
    "tsc",
    "-p",
    buildProject.configPath,
    "--noEmit",
    "false",
    "--declaration",
    "true",
    "--declarationMap",
    "false",
    "--sourceMap",
    "false",
    "--rewriteRelativeImportExtensions",
    "--outDir",
    "dist",
  ],
  { cwd: packageRoot, stdio: "inherit" },
);
if (result.error) {
  buildProject.cleanup();
  throw result.error;
}
if (result.status !== 0) {
  buildProject.cleanup();
  process.exit(result.status ?? 1);
}
buildProject.cleanup();

copyDeclarationFiles(sourceRoot, outputRoot);
rewriteDeclarationExtensions(outputRoot);
inlineCssImports(outputRoot, sourceRoot);
copyFileSync(resolve(packageRoot, "../../LICENSE"), resolve(outputRoot, "LICENSE"));

function inlineCssImports(directory, sourceDirectory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      inlineCssImports(absolutePath, sourceDirectory);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;

    const code = readFileSync(absolutePath, "utf8");
    const rewritten = code.replace(
      /import\s+([A-Za-z_$][\w$]*)\s+from\s+("|')([^"']+\.css\?inline)\2\s*;?/g,
      (statement, binding, _quote, specifier) => {
        const cssPath = resolve(dirname(absolutePath), specifier.slice(0, -"?inline".length));
        const sourcePath = resolve(sourceDirectory, relative(outputRoot, cssPath));
        const css = readFileSync(sourcePath, "utf8");
        return `const ${binding} = ${JSON.stringify(css)};`;
      },
    );
    if (rewritten !== code) writeFileSync(absolutePath, rewritten);
  }
}

// TypeScript consumes declaration-only inputs but does not copy them to the
// output directory. Preserve ambient public contracts such as
// `virtual-design-tokens.d.ts` so every declared export target exists in the
// packed artifact.
function copyDeclarationFiles(sourceDirectory, outputDirectory) {
  for (const entry of readdirSync(sourceDirectory, { withFileTypes: true })) {
    const sourcePath = resolve(sourceDirectory, entry.name);
    const outputPath = resolve(outputDirectory, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(outputPath, { recursive: true });
      copyDeclarationFiles(sourcePath, outputPath);
      continue;
    }
    if (
      !entry.isFile()
      || !entry.name.endsWith(".d.ts")
      || entry.name.includes(".test.")
      || entry.name.includes(".spec.")
      || entry.name === "_testUtils.d.ts"
      || entry.name === "inspector-shims.d.ts"
    ) continue;
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, readFileSync(sourcePath));
  }
}

// `rewriteRelativeImportExtensions` currently rewrites emitted JavaScript but
// leaves declaration references unchanged. A consumer loading a declaration
// through package exports must still reach the executable sibling in dist.
function rewriteDeclarationExtensions(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      rewriteDeclarationExtensions(absolutePath);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".d.ts")) continue;
    const code = readFileSync(absolutePath, "utf8");
    const rewritten = code.replace(
      /(["'])(\.\.?\/[^"']+?)(\.(?:tsx|ts|cts|mts))(?=\1)/g,
      (statement, quote, path, extension) => {
        if (path.endsWith(".d")) return statement;
        const outputExtension = extension === ".cts" ? ".cjs" : extension === ".mts" ? ".mjs" : ".js";
        // The closing quote is retained by the lookahead.
        return `${quote}${path}${outputExtension}`;
      },
    );
    if (rewritten !== code) writeFileSync(absolutePath, rewritten);
  }
}

/**
 * macOS filesystems are commonly case-insensitive, while this package has a
 * deliberate `ChangesLog.tsx` UI module alongside the `changesLog.ts` store.
 * TypeScript cannot emit both basename variants into one directory there.
 * Compile a temporary, renamed copy of that package's sources and preserve
 * the public module names in the emitted graph. No source checkout files are
 * changed and the temporary tree is removed as soon as emit completes.
 */
function createBuildProject(packageDirectory, sourceDirectory) {
  const defaultConfigPath = "tsconfig.build.json";
  if (basename(packageDirectory) !== "inspector") {
    return { configPath: defaultConfigPath, cleanup() {} };
  }

  // Keep the temporary tree below the package so bare dependencies resolve
  // through this package's own node_modules directory (rather than through a
  // system temporary directory with no workspace ancestry).
  const temporaryRoot = mkdtempSync(join(packageDirectory, ".tmp-inspector-build-"));
  const temporarySource = join(temporaryRoot, "src");
  cpSync(sourceDirectory, temporarySource, { recursive: true });

  const sourceModule = join(temporarySource, "ChangesLog.tsx");
  const renamedModule = join(temporarySource, "ChangesLogComponent.tsx");
  if (statSync(sourceModule, { throwIfNoEntry: false })?.isFile()) {
    renameSync(sourceModule, renamedModule);
    rewriteTemporaryImports(temporarySource);
  }

  // Keep the temporary config next to the package so TypeScript resolves the
  // package's installed `@types` exactly as it does for a normal build.
  const temporaryConfig = join(packageDirectory, ".tsconfig.build.tmp.json");
  writeFileSync(
    temporaryConfig,
    JSON.stringify({
      extends: resolve(packageDirectory, "tsconfig.build.json"),
      compilerOptions: {
        rootDir: temporarySource,
        outDir: resolve(packageDirectory, "dist"),
      },
      include: [temporarySource],
      exclude: buildExcludes(temporarySource),
    }),
  );

  return {
    configPath: temporaryConfig,
    cleanup() {
      rmSync(temporaryConfig, { force: true });
      rmSync(temporaryRoot, { recursive: true, force: true });
    },
  };
}

function buildExcludes(sourceDirectory) {
  return [
    join(sourceDirectory, "**/*.test.ts"),
    join(sourceDirectory, "**/*.test.tsx"),
    join(sourceDirectory, "**/*.spec.ts"),
    join(sourceDirectory, "**/*.spec.tsx"),
    join(sourceDirectory, "**/_testUtils.ts"),
    join(sourceDirectory, "**/__stubs__/**"),
  ];
}

function rewriteTemporaryImports(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      rewriteTemporaryImports(absolutePath);
      continue;
    }
    if (!entry.isFile() || !/\.(?:[cm]?[jt]sx?|d\.ts)$/.test(entry.name)) continue;
    const source = readFileSync(absolutePath, "utf8");
    const rewritten = source.replaceAll("./ChangesLog.tsx", "./ChangesLogComponent.tsx");
    if (rewritten !== source) writeFileSync(absolutePath, rewritten);
  }
}
