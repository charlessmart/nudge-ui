import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

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
  /^@design-tool\/plugin/,
  /^@design-tool\/inspector/,
];

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

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const importPattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importPattern.exec(source)) !== null) {
    const specifier = match[1];
    if (specifier === undefined) continue;
    if (specifier.startsWith("./") || specifier.startsWith("../")) continue;
    specifiers.push(specifier);
  }
  const dynamicImport = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImport.exec(source)) !== null) {
    const specifier = match[1];
    if (specifier === undefined) continue;
    if (specifier.startsWith("./") || specifier.startsWith("../")) continue;
    specifiers.push(specifier);
  }
  return specifiers;
}

describe("@design-tool/css import graph (browser-safe subpaths)", () => {
  it("ship modules must never import Node, Vite, React, PostCSS, or filesystem code", () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const specifier of importSpecifiers(source)) {
        if (FORBIDDEN_SPECIFIERS.some((pattern) => pattern.test(specifier))) {
          violations.push(`${file}: imports forbidden specifier "${specifier}"`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("exports resolve to browser-safe subpaths only", () => {
    const files = sourceFiles(SRC);
    const nonBareSpecifiers = files.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return importSpecifiers(source)
        .filter((specifier) => specifier.startsWith("@design-tool/"))
        .map((specifier) => `${file}: ${specifier}`);
    });
    expect(nonBareSpecifiers).toEqual([]);
  });
});
