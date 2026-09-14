import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "../..");

const BROWSER_SAFE_ROOTS = ["src/css/index.ts", "src/css/model", "src/css/value-semantics"];
const NODE_PATH_ROOT = "src/css/token-inventory";

const FORBIDDEN_SPECIFIERS = [
  /^node:/,
  /^fs$/,
  /^fs\//,
  /^path$/,
  /^path\//,
  /^os$/,
  /^process$/,
  /^vite/,
  /^react$/,
  /^react\//,
  /^postcss/,
  // The hosts and the inspector are sibling directories now rather than
  // separate packages, so the boundary is a relative path, not a package name.
  /(^|\/)\.\.\/hosts\//,
  /(^|\/)\.\.\/inspector\//,
];

/** Any import/export of the token-inventory module, bare or relative. */
function isTokenInventorySpecifier(specifier: string): boolean {
  return specifier.includes("token-inventory");
}

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      files.push(...sourceFiles(full));
    } else if (name.endsWith(".ts") && !name.endsWith(".d.ts") && !name.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Every module specifier appearing in `import`/`export` (including side-effect
 * imports and dynamic `import()`). Relative specifiers are returned too so the
 * token-inventory path is detectable even when reached via a relative import.
 */
function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const importPattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importPattern.exec(source)) !== null) {
    const specifier = match[1];
    if (specifier === undefined) continue;
    specifiers.push(specifier);
  }
  const dynamicImport = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImport.exec(source)) !== null) {
    const specifier = match[1];
    if (specifier === undefined) continue;
    specifiers.push(specifier);
  }
  return specifiers;
}

function inBrowserSafeSubpath(file: string): boolean {
  return BROWSER_SAFE_ROOTS.some((root) => file.startsWith(join(SRC, root)));
}

function browserSafeFiles(): string[] {
  return sourceFiles(SRC).filter(inBrowserSafeSubpath);
}

function nodePathFiles(): string[] {
  return sourceFiles(join(SRC, NODE_PATH_ROOT));
}

describe("nudge-ui/css import graph (browser-safe vs Node/build-time)", () => {
  it("browser-safe modules (index.ts, model, value-semantics) never import Node, Vite, React, PostCSS, filesystem, or the token-inventory Node path", () => {
    const files = browserSafeFiles();
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((file) => !file.includes(NODE_PATH_ROOT))).toBe(true);

    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const specifier of importSpecifiers(source)) {
        if (FORBIDDEN_SPECIFIERS.some((pattern) => pattern.test(specifier))) {
          violations.push(`${file}: browser-safe module imports forbidden specifier "${specifier}"`);
        }
        if (isTokenInventorySpecifier(specifier)) {
          violations.push(`${file}: browser-safe module reaches the Node-only token-inventory path via "${specifier}"`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("the browser-safe root entry never re-exports the token-inventory Node path", () => {
    const rootEntry = readFileSync(join(SRC, "src", "css", "index.ts"), "utf8");
    expect(importSpecifiers(rootEntry).filter(isTokenInventorySpecifier)).toEqual([]);
  });

  it("the token-inventory Node path is reachable and may use PostCSS", () => {
    const files = nodePathFiles();
    expect(files.length).toBeGreaterThan(0);
    const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).toMatch(/from "postcss"/);
  });

  it("exports resolve to browser-safe subpaths only from browser-safe modules", () => {
    const files = browserSafeFiles();
    const nonBareSpecifiers = files.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return importSpecifiers(source)
        .filter((specifier) => specifier.startsWith("@nudge-ui/"))
        .map((specifier) => `${file}: ${specifier}`);
    });
    expect(nonBareSpecifiers).toEqual([]);
  });
});
