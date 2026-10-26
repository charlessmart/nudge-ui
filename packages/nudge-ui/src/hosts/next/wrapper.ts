import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import type { ComponentModuleProtocols } from "../../compiler/componentPolicyResolution.ts";
import { ensureSidecar, type SidecarHandle } from "./sidecar.ts";
import { buildManifest } from "./manifest.ts";
import { nudgeUiRepositoryPackagePath } from "./repositoryScope.ts";
import { isNudgeUiEnabled } from "../environment.ts";
import {
  NUDGE_UI_EDITOR_QUERY_PARAM,
  NUDGE_UI_EDITOR_QUERY_VALUE,
  NUDGE_UI_ROUTE_PREFIX,
} from "../../transport/index.ts";

export interface NudgeUiNextConfig {
  [key: string]: unknown;
  turbopack?: {
    rules?: Record<string, unknown>;
    [key: string]: unknown;
  };
  webpack?: (
    config: Record<string, unknown>,
    context: { dev: boolean; [key: string]: unknown },
  ) => Record<string, unknown>;
  rewrites?: (() => Promise<RewritesShape> | RewritesShape) | RewritesShape;
  transpilePackages?: string[];
}

export interface NudgeUiNextOptions {
  /** `false` returns the configuration untouched. `NUDGE_UI=0` has the same effect for one run. */
  readonly enabled?: boolean;
  readonly componentProtocols?: ComponentModuleProtocols;
  /** Authored workspace directories outside the Next.js application root. */
  readonly sourceRoots?: readonly string[];
}

export interface RewritesSource {
  source: string;
  destination: string;
  [key: string]: unknown;
}

export interface RewritesShape {
  beforeFiles?: RewritesSource[];
  afterFiles?: RewritesSource[];
  fallback?: RewritesSource[];
  [key: string]: unknown;
}

const NAMESPACE_PREFIX = NUDGE_UI_ROUTE_PREFIX.slice(0, -1);

const SUPPORTED_NEXT_RANGE = ">=15.3 <17";

/** Both compilers load the bundled CJS loaders from `dist/`: neither executes TypeScript loaders, and Turbopack needs the module itself to be the loader. */
interface LoaderPaths {
  identity: string;
  plugin: string;
}

/** Resolved from the package root so the path is the same from `src/` and `dist/`. */
function loaderPaths(): LoaderPaths {
  const loaders = new URL("../../../dist/hosts/next/loaders/", import.meta.url);
  return {
    plugin: fileURLToPath(new URL("loader-plugin.cjs", loaders)),
    identity: fileURLToPath(new URL("identity-loader.cjs", loaders)),
  };
}

function hostPackageDir(root: string, name: string): string | null {
  try {
    const require = createRequire(join(root, "package.json"));
    return dirname(require.resolve(`${name}/package.json`));
  } catch {
    return null;
  }
}

function adapterPackageExport(specifier: string): string | null {
  try {
    return createRequire(import.meta.url).resolve(specifier);
  } catch {
    return null;
  }
}

function relativeTurbopackAlias(root: string, target: string): string {
  const value = relative(root, target).split("\\").join("/");
  return value.startsWith(".") ? value : `./${value}`;
}

function resolveNextVersion(root: string): string | null {
  try {
    const require = createRequire(join(root, "package.json"));
    return (require("next/package.json") as { version?: string }).version ?? null;
  } catch {
    return null;
  }
}

/** Fails closed on a resolved unsupported version; an unresolvable one proceeds with a diagnostic. */
function gateUnsupportedVersion(version: string | null): boolean {
  if (version && isVersionSupported(version)) return true;
  console.warn(
    `[nudge-ui] Next.js ${version ?? "(version unavailable)"} is outside the tested range `
      + `${SUPPORTED_NEXT_RANGE} (ADR-0010). Skipping instrumentation — remove `
      + `withNudgeUi() or align versions to enable Nudge UI.`,
  );
  return false;
}

function isVersionSupported(version: string): boolean {
  const match = /^(\d+)\.(\d+)/.exec(version);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return (major === 15 && minor >= 3) || (major >= 16 && major < 17);
}

function collectUserRewriteSources(rewrites: RewritesShape): string[] {
  return [
    ...(rewrites.beforeFiles ?? []),
    ...(rewrites.afterFiles ?? []),
    ...(rewrites.fallback ?? []),
  ]
    .map((rule) => rule.source)
    .filter((source) => source.startsWith(NAMESPACE_PREFIX));
}

/** Mirrors next/constants PHASE_DEVELOPMENT_SERVER. */
export const DEVELOPMENT_SERVER_PHASE = "phase-development-server";

/** Object exports are converted to factories so the phase is always available; the phase gate keeps `NODE_ENV=development next build` uninstrumented. */
function isDevelopmentEvaluation(phase: string): boolean {
  return process.env.NODE_ENV === "development" && phase === DEVELOPMENT_SERVER_PHASE;
}

/** Function form: gates instrumentation on PHASE_DEVELOPMENT_SERVER. */
export function withNudgeUi<T extends object>(
  factory: (phase: string) => T,
  options?: NudgeUiNextOptions,
): (phase: string) => T;
/** Object form: returns a phase-aware Next.js config factory. */
export function withNudgeUi<T extends object>(
  config: T,
  options?: NudgeUiNextOptions,
): (phase: string) => T;
export function withNudgeUi<T extends object>(
  config: T | ((phase: string) => T) = {} as T,
  options: NudgeUiNextOptions = {},
): (phase: string) => T {
  const factory = typeof config === "function"
    ? config as (phase: string) => T
    : () => config;
  return (phase: string): T => {
    const resolved = factory(phase);
    if (!isDevelopmentEvaluation(phase) || !isNudgeUiEnabled(options.enabled)) return resolved;
    return instrumentConfig(resolved, options);
  };
}

function instrumentConfig<T extends object>(config: T, options: NudgeUiNextOptions): T {

  // Consumers pass their real NextConfig; the structural view keeps this package typecheckable without next installed.
  const source = config as NudgeUiNextConfig;
  const root = process.cwd();
  if (!gateUnsupportedVersion(resolveNextVersion(root))) {
    return config;
  }

  const sourceRoots = options.sourceRoots?.map((sourceRoot) => resolve(root, sourceRoot));

  // ensureSidecar is a per-process singleton; awaiting it wherever the port is needed removes any config-evaluation race.
  const sidecarPort = (): Promise<number> =>
    ensureSidecar(root, {
      manifest: buildManifest({ root }),
      tokens: true,
      ...(sourceRoots ? { sourceRoots } : {}),
    })
      .then((handle: SidecarHandle) => handle.port)
      .catch((error: unknown) => {
        console.warn("[nudge-ui] sidecar failed to start:", error);
        return 0;
      });

  const nextConfig: NudgeUiNextConfig = { ...source };

  const nudgeUiPackages = ["nudge-ui"];
  const userTranspile = Array.isArray(source.transpilePackages)
    ? source.transpilePackages
    : [];
  nextConfig.transpilePackages = [
    ...userTranspile,
    ...nudgeUiPackages.filter((name) => !userTranspile.includes(name)),
  ];

  const turbopackRules = {
    ...((source.turbopack?.rules as Record<string, unknown> | undefined) ?? {}),
  };
  const paths = loaderPaths();
  const loaderOptions = {
    root,
    ...(options.componentProtocols ? { componentProtocols: options.componentProtocols } : {}),
    ...(sourceRoots ? { sourceRoots } : {}),
  };
  if (process.env.NUDGE_UI_NEXT_TURBOPACK_RULES !== "0") {
    const identityRule = {
      loaders: [{
        loader: paths.plugin,
        options: loaderOptions,
      }],
      // 'foreign' marks dependency code in Turbopack; `not: foreign` plus the path guard confines the loader to first-party sources outside .next.
      condition: {
        all: [
          { not: "foreign" },
          { not: { path: "(**/)?\\.next/**" } },
          // Workspace symlinks are not 'foreign', so Nudge UI's own packages must be excluded explicitly or the inspector would instrument itself.
          {
            not: {
              path: nudgeUiRepositoryPackagePath,
            },
          },
        ],
      },
    };
    /** Composed with any user rule for the same key: silently overwriting host configuration is never acceptable. */
    const compose = (key: string, rule: Record<string, unknown>): void => {
      const existing = turbopackRules[key];
      if (existing === undefined) {
        turbopackRules[key] = rule;
        return;
      }
      // [].concat flattens one level, so an existing collection stays flat.
      turbopackRules[key] = ([] as unknown[]).concat(existing as never, rule);
    };
    compose("*.tsx", { ...identityRule });
    compose("*.jsx", { ...identityRule });

  }
  // Nudge UI carries its own react copy for standalone consumers; without an alias SWC loads both, and two Reacts in one document silently break inspector rendering.
  const hostReact = hostPackageDir(root, "react");
  const hostReactDom = hostPackageDir(root, "react-dom");
  const componentRuntime = adapterPackageExport("nudge-ui/internal/component-runtime");
  if (hostReact || hostReactDom || componentRuntime) {
    const userAlias = (source.turbopack?.resolveAlias as Record<string, unknown> | undefined) ?? {};
    nextConfig.turbopack = {
      ...nextConfig.turbopack,
      resolveAlias: {
        ...(hostReact ? { react: relativeTurbopackAlias(root, hostReact) } : {}),
        ...(hostReactDom ? { "react-dom": relativeTurbopackAlias(root, hostReactDom) } : {}),
        ...(componentRuntime
          ? {
            "nudge-ui/internal/component-runtime":
              relativeTurbopackAlias(root, componentRuntime),
          }
          : {}),
        ...userAlias,
      },
    };
  }

  nextConfig.turbopack = {
    ...(nextConfig.turbopack ?? {}),
    rules: turbopackRules,
  };

  const userWebpack = source.webpack;
  nextConfig.webpack = (webpackConfig: Record<string, unknown>, context: { dev: boolean }) => {
    const merged = userWebpack ? userWebpack(webpackConfig, context) : webpackConfig;
    if (!context.dev) return merged;
    const module = (merged.module ?? {}) as Record<string, unknown>;
    const resolveConfig = (merged.resolve ?? {}) as Record<string, unknown>;
    const userAlias = (resolveConfig.alias ?? {}) as Record<string, unknown>;
    const rules = Array.isArray(module.rules) ? [...(module.rules as unknown[])] : [];
    const paths = loaderPaths();
    // Next 16 removed the webpack CSS pipeline entirely (nextjs.org/docs/messages/built-in-css-disabled); registration stays so Next 15.x works, and the combination is flagged loudly.
    const version = resolveNextVersion(root);
    if (version && Number(version.split(".")[0]) >= 16) {
      console.warn(
        "[nudge-ui] Next.js " + version + " webpack dev mode has no CSS support "
          + "(removed upstream); CSS-bearing applications will fail to compile "
          + "independent of Nudge UI. Prefer Turbopack (default) or Next 15.x.",
      );
    }
    rules.push({
      test: /\.(tsx|jsx)$/,
      exclude: /node_modules/,
      enforce: "pre",
      use: [{
        loader: paths.identity,
        options: loaderOptions,
      }],
    });
    return {
      ...merged,
      resolve: {
        ...resolveConfig,
        alias: {
          ...(componentRuntime
            ? { "nudge-ui/internal/component-runtime": componentRuntime }
            : {}),
          ...userAlias,
        },
      },
      module: { ...module, rules },
    };
  };

  const proxyRewrite = (port: number): RewritesSource => ({
    source: `${NUDGE_UI_ROUTE_PREFIX}:path*`,
    destination: `http://127.0.0.1:${port}${NUDGE_UI_ROUTE_PREFIX}:path*`,
  });

  const editorRewrite = (port: number, header: { key: string; value: string }): RewritesSource => ({
    source: "/:path*",
    has: [
      { type: "query", key: NUDGE_UI_EDITOR_QUERY_PARAM, value: NUDGE_UI_EDITOR_QUERY_VALUE },
      { type: "header", ...header },
    ],
    destination: `http://127.0.0.1:${port}/:path*`,
  });

  const resolveRewrites = async (): Promise<RewritesShape> => {
    const port = await sidecarPort();
    const userRewrites =
      typeof source.rewrites === "function"
        ? await source.rewrites()
        : source.rewrites;

    const shape: RewritesShape = Array.isArray(userRewrites)
      ? { afterFiles: userRewrites as RewritesSource[] }
      : (userRewrites ?? {});

    const collisions = collectUserRewriteSources(shape);
    if (collisions.length > 0) {
      console.warn(
        "[nudge-ui] /__nudge_ui__ is a reserved namespace (ADR-0010); "
          + "your rewrites also declare it and will be shadowed:",
        collisions,
      );
    }

    return {
      // Port 0 (failed sidecar) yields a dead destination: an honest fetch failure beats silently pretending to work.
      beforeFiles: [
        proxyRewrite(port),
        editorRewrite(port, { key: "accept", value: ".*text/html.*" }),
        editorRewrite(port, { key: "sec-fetch-dest", value: "document" }),
        ...(shape.beforeFiles ?? []),
      ],
      afterFiles: shape.afterFiles ?? [],
      fallback: shape.fallback ?? [],
    };
  };

  nextConfig.rewrites = resolveRewrites;

  return nextConfig as T;
}

