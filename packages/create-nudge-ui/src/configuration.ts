import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConfigurationChange, Framework } from "./types.ts";

const nextConfigNames = ["next.config.ts", "next.config.mts", "next.config.mjs", "next.config.js", "next.config.cjs"];
const astroConfigNames = ["astro.config.ts", "astro.config.mts", "astro.config.mjs", "astro.config.js"];
const viteConfigNames = ["vite.config.ts", "vite.config.mts", "vite.config.mjs", "vite.config.js"];

/** Plans an idempotent host-configuration edit without writing to the project. */
export function planConfiguration(projectRoot: string, framework: Framework): ConfigurationChange | undefined {
  if (framework === "standalone") return undefined;
  const existingName = configurationNames(framework).find((name) => existsSync(join(projectRoot, name)));
  const name = existingName ?? defaultConfigName(framework);
  const path = join(projectRoot, name);
  const original = existingName ? readFileSync(path, "utf8") : defaultConfiguration(framework);
  const content = configureSource(original, framework, name);
  if (content === original) return undefined;
  return { path, content, created: !existingName };
}

/** Adds the selected adapter to a conventional host configuration source. */
export function configureSource(source: string, framework: Exclude<Framework, "standalone">, fileName: string): string {
  if (framework === "astro") return configureArrayHost(source, framework, "integrations", "nudgeUiAstro()");
  if (framework === "vite-react") return configureArrayHost(source, framework, "plugins", "...nudgeUi()");
  return configureNextSource(source, fileName);
}

function configureArrayHost(
  source: string,
  framework: "astro" | "vite-react",
  property: "integrations" | "plugins",
  expression: string,
): string {
  const binding = framework === "astro" ? "nudgeUiAstro" : "nudgeUi";
  if (source.includes(expression)) return source;
  const imported = source.includes(adapterSpecifier(framework))
    ? source
    : insertImport(source, `import { ${binding} } from "${adapterSpecifier(framework)}";`);
  const propertyPattern = new RegExp(`(^[ \\t]*)${property}\\s*:\\s*\\[`, "m");
  const propertyMatch = propertyPattern.exec(imported);
  if (propertyMatch) {
    const indentation = propertyMatch[1] ?? "";
    const insertionPoint = propertyMatch.index + propertyMatch[0].length;
    return `${imported.slice(0, insertionPoint)}\n${indentation}  ${expression},\n${indentation}  ${imported.slice(insertionPoint)}`;
  }

  const configPattern = /defineConfig\s*\(\s*\{/;
  const configMatch = configPattern.exec(imported);
  if (!configMatch) {
    throw new Error(`Could not update ${property}: expected a defineConfig({ ... }) call or an existing ${property} array.`);
  }
  const insertionPoint = configMatch.index + configMatch[0].length;
  return `${imported.slice(0, insertionPoint)}\n  ${property}: [${expression}],${imported.slice(insertionPoint)}`;
}

function configureNextSource(source: string, fileName: string): string {
  if (source.includes("withNudgeUi(")) return source;
  const commonJs = fileName.endsWith(".cjs") || /\bmodule\.exports\s*=/.test(source);
  const importStatement = commonJs
    ? 'const { withNudgeUi } = require("@nudge-ui/nextjs");'
    : 'import { withNudgeUi } from "@nudge-ui/nextjs";';
  const imported = source.includes("@nudge-ui/nextjs") ? source : insertImport(source, importStatement);
  const exportPattern = commonJs
    ? /module\.exports\s*=\s*([A-Za-z_$][\w$]*)\s*;?/
    : /export\s+default\s+([A-Za-z_$][\w$]*)\s*;?/;
  const match = exportPattern.exec(imported);
  if (!match?.[1]) {
    throw new Error("Could not update the Next.js configuration: expected an exported configuration variable.");
  }
  const replacement = commonJs
    ? `module.exports = withNudgeUi(${match[1]});`
    : `export default withNudgeUi(${match[1]});`;
  return `${imported.slice(0, match.index)}${replacement}${imported.slice(match.index + match[0].length)}`;
}

function insertImport(source: string, statement: string): string {
  const shebangMatch = /^#![^\n]*\n/.exec(source);
  const insertionPoint = shebangMatch?.[0].length ?? 0;
  return `${source.slice(0, insertionPoint)}${statement}\n${source.slice(insertionPoint)}`;
}

function adapterSpecifier(framework: Exclude<Framework, "standalone">): string {
  if (framework === "nextjs") return "@nudge-ui/nextjs";
  if (framework === "astro") return "@nudge-ui/astro";
  return "@nudge-ui/vite-react";
}

function defaultConfigName(framework: Exclude<Framework, "standalone">): string {
  if (framework === "nextjs") return "next.config.mjs";
  if (framework === "astro") return "astro.config.mjs";
  return "vite.config.mjs";
}

function defaultConfiguration(framework: Exclude<Framework, "standalone">): string {
  if (framework === "nextjs") return "const nextConfig = {};\n\nexport default nextConfig;\n";
  if (framework === "astro") {
    return 'import { defineConfig } from "astro/config";\n\nexport default defineConfig({});\n';
  }
  return 'import { defineConfig } from "vite";\n\nexport default defineConfig({});\n';
}

function configurationNames(framework: Exclude<Framework, "standalone">): readonly string[] {
  if (framework === "nextjs") return nextConfigNames;
  if (framework === "astro") return astroConfigNames;
  return viteConfigNames;
}
