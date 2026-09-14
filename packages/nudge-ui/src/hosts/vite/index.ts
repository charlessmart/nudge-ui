import type { ConfigEnv, Plugin, UserConfig, UserConfigExport } from "vite";
import { createVitePlugins, type NudgeUiOptions } from "./vite.ts";
import { createReactSupport } from "./react.ts";

/**
 * Composes two independent halves: `./vite.ts` owns the build tool and knows
 * nothing about JSX, `./react.ts` owns React and knows nothing about Vite.
 * This is deliberately the only file that names both.
 */
export function nudgeUi(options: NudgeUiOptions = {}): Plugin[] {
  return createVitePlugins(options, createReactSupport);
}

/**
 * Adds this host to an existing Vite configuration export. Object, promise,
 * and function forms are resolved at the same boundary Vite uses, so the host
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
// Interpretation lives in css/dialects, where the browser runtime reaches the
// same grammar; this host only gathers evidence.
export type { TailwindV3Config, ThemeContract } from "../../css/dialects/index.ts";
