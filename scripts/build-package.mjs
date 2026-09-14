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
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
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
const result = spawnSync(
  pnpm,
  [
    "exec",
    "tsc",
    "-p",
    "tsconfig.build.json",
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
  throw result.error;
}
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

copyDeclarationFiles(sourceRoot, outputRoot);
copyStaticAssets(sourceRoot, outputRoot);
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

function copyStaticAssets(sourceDirectory, outputDirectory) {
  for (const entry of readdirSync(sourceDirectory, { withFileTypes: true })) {
    const sourcePath = resolve(sourceDirectory, entry.name);
    const outputPath = resolve(outputDirectory, entry.name);
    if (entry.isDirectory()) {
      copyStaticAssets(sourcePath, outputPath);
      continue;
    }
    if (!entry.isFile() || !/\.(?:avif|gif|jpe?g|png|svg|webp|woff2?)$/i.test(entry.name)) continue;
    mkdirSync(dirname(outputPath), { recursive: true });
    copyFileSync(sourcePath, outputPath);
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

