import type { ConfigEnv, Plugin, UserConfig, UserConfigExport } from "vite";
import { createVitePlugins, type NudgeUiOptions } from "./vite.ts";
import { createReactSupport } from "./react.ts";

/**
 * Vite plus React.
 *
 * This package is one composition of two independent halves. `./vite.ts` owns
 * the build tool and knows nothing about JSX; `./react.ts` owns React and
 * knows nothing about Vite. Composing them is this file's only job, and it is
 * deliberately the only place that names both.
 *
 * The halves were one 1,255-line module. Separating them is what lets the
 * Vite host be understood, tested, and changed without reading React code —
 * and `vite.noFramework.test.ts` runs that host with no framework at all,
 * which is the standing proof that the separation is real rather than
 * cosmetic.
 */
export function nudgeUi(options: NudgeUiOptions = {}): Plugin[] {
  return createVitePlugins(options, createReactSupport);
}

/**
 * Adds this host to an existing Vite configuration export.
 *
 * Vite configuration exports may be objects, promises, or functions that
 * receive the current command and mode. Resolve those forms at the same
 * boundary where Vite resolves the application configuration, so the host
 * keeps ownership of its runtime root and dependency graph.
 */
export function withNudgeUi(
  config: UserConfigExport,
  options: NudgeUiOptions = {},
): UserConfigExport {
  if (typeof config === "function") {
    // SAFETY: The typeof guard selects the function form of UserConfigExport, whose signature this cast states.
    const resolveConfig = config as (env: ConfigEnv) => UserConfig | Promise<UserConfig>;
    return (env: ConfigEnv) => appendNudgeUi(resolveConfig(env), options);
  }
  return appendNudgeUi(config, options);
}

function appendNudgeUi(
  config: UserConfig | Promise<UserConfig>,
  options: NudgeUiOptions,
): UserConfig | Promise<UserConfig> {
  if (isPromiseLike<UserConfig>(config)) {
    return Promise.resolve(config).then((resolved) => appendNudgeUi(resolved, options));
  }
  if (hasNudgeUiPlugin(config.plugins)) return config;
  return { ...config, plugins: [...(config.plugins ?? []), ...nudgeUi(options)] };
}

function hasNudgeUiPlugin(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((entry) => hasNudgeUiPlugin(entry));
  return typeof value === "object"
    && value !== null
    && "name" in value
    && typeof value.name === "string"
    && value.name.startsWith("nudge-ui");
}

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return typeof value === "object"
    && value !== null
    && "then" in value
    && typeof value.then === "function";
}

export type { NudgeUiOptions, VanillaExtractOptions } from "./vite.ts";
export { extractViteModuleCss, transformIndexHtmlHtml } from "./vite.ts";
export type { TransformIndexHtmlOptions } from "./vite.ts";
export { isHostApplicationSource } from "./tokens/viteStylesheetArtifacts.ts";
export type { TokenContext, TokenDeclaration, TokenDefinition, TokenEntry } from "./virtual/design-tokens.ts";
/**
 * Dialect interpretation is host-neutral and lives in `@nudge-ui/css/dialects`,
 * where the browser runtime reaches the same grammar. This host only gathers
 * the evidence.
 */
export type { TailwindV3Config, ThemeContract } from "@nudge-ui/css/dialects";
