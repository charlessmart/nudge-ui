import { parse } from "@babel/parser";
import { isAbsolute, relative, sep } from "node:path";
import { createReactNativeComponentFramework } from "../componentFramework/reactNative.ts";

/** What `withNudgeUi` hands the Metro transform workers, through the environment because Metro serialises no custom transformer options. */
export interface ExpoTransformSettings {
  /** Canonical project root; identity paths are relative to it. */
  readonly root: string;
  /** Authored directories outside the root that are instrumented too. */
  readonly sourceRoots: readonly string[];
  /** Nudge UI's own package, which must never instrument itself when linked from a workspace. */
  readonly packageRoot: string;
  readonly primitiveModules: readonly string[];
  /** Absolute path of the generated web bootstrap, imported by every instrumented module so Metro keeps it in the graph. */
  readonly bootstrap?: string | null;
}

/** The slice of Metro's Babel transformer options this host reads. */
export interface ExpoTransformTarget {
  readonly dev: boolean;
  readonly platform: string | null | undefined;
  /** `customTransformOptions.environment`: `node` for static rendering, `react-server` for server components. */
  readonly environment?: string | undefined;
}

export const EXPO_TRANSFORM_SETTINGS_ENV = "NUDGE_UI_EXPO_TRANSFORM";
export const EXPO_UPSTREAM_TRANSFORMER_ENV = "NUDGE_UI_EXPO_UPSTREAM_TRANSFORMER";

const JSX_SOURCE = /\.(?:tsx|jsx)$/;

export function readExpoTransformSettings(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ExpoTransformSettings | null {
  const raw = env[EXPO_TRANSFORM_SETTINGS_ENV];
  if (!raw) return null;
  try {
    // SAFETY: Each field is checked below before the value is used as settings.
    const parsed = JSON.parse(raw) as Partial<ExpoTransformSettings>;
    if (typeof parsed.root !== "string" || typeof parsed.packageRoot !== "string") return null;
    return {
      root: parsed.root,
      packageRoot: parsed.packageRoot,
      sourceRoots: Array.isArray(parsed.sourceRoots) ? parsed.sourceRoots.filter((value) => typeof value === "string") : [],
      primitiveModules: Array.isArray(parsed.primitiveModules)
        ? parsed.primitiveModules.filter((value) => typeof value === "string")
        : [],
      bootstrap: typeof parsed.bootstrap === "string" ? parsed.bootstrap : null,
    };
  } catch {
    return null;
  }
}

function isInside(directory: string, file: string): boolean {
  const path = relative(directory, file);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

/** Project-owned JSX: inside the root or a declared source root, outside dependencies and Nudge UI itself. */
export function isExpoProjectSource(file: string, settings: ExpoTransformSettings): boolean {
  if (!JSX_SOURCE.test(file)) return false;
  const normalized = file.split("\\").join("/");
  if (normalized.includes("/node_modules/") || normalized.includes("/.expo/") || normalized.includes("/.nudge/")) return false;
  if (isInside(settings.packageRoot, file)) return false;
  return isInside(settings.root, file) || settings.sourceRoots.some((root) => isInside(root, file));
}

/**
 * Instruments one module for the web development bundle; null leaves the source untouched.
 * Native platforms and production bundles are never instrumented (ADR-0002). Server renders get identity only, so the
 * HTML they produce matches what the browser hydrates without pulling the browser runtime into Node.
 */
export function transformExpoModuleSource(
  source: string,
  file: string,
  target: ExpoTransformTarget,
  settings: ExpoTransformSettings,
): string | null {
  if (!target.dev || target.platform !== "web") return null;
  if (!isExpoProjectSource(file, settings)) return null;
  const framework = createReactNativeComponentFramework(settings.primitiveModules);
  const server = target.environment === "node" || target.environment === "react-server";
  const result = framework.instrument(source, file, settings.root, { instrumentComponents: !server });
  if (!result) return null;
  const bootstrapImport = settings.bootstrap ? `import ${JSON.stringify(settings.bootstrap)};` : "";
  return result.prelude ? inlinePrelude(result.code, result.prelude, bootstrapImport) : result.code;
}

/**
 * Metro gets no input source map from a Babel transformer, so the prelude must not add a line: it moves onto the first
 * line, after any directive prologue (`"use dom"`, `"use client"`), keeping every later line where the author wrote it.
 * The bootstrap import leads it, so every instrumented module pulls the bootstrap into the graph; Expo's web
 * serializer drops `getPolyfills`, and `getModulesRunBeforeMainModule` only runs modules the graph already holds.
 */
function inlinePrelude(code: string, prelude: string, leading: string): string {
  if (!code.startsWith(prelude)) return code;
  const body = code.slice(prelude.length);
  const statement = `${leading}${prelude.trimEnd()}`;
  const offset = directivePrologueEnd(body);
  return `${body.slice(0, offset)}${statement}${body.slice(offset)}`;
}

function directivePrologueEnd(code: string): number {
  try {
    const ast = parse(code, { sourceType: "module", plugins: ["jsx", "typescript"], errorRecovery: true });
    const last = ast.program.directives.at(-1);
    return last?.end ?? 0;
  } catch {
    return 0;
  }
}
