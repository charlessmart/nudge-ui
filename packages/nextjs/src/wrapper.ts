import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { ensureSidecar, type SidecarHandle } from "./sidecar.ts";
import { buildManifest } from "./manifest.ts";

/**
 * `withNudgeUi(nextConfig)` — the single user touchpoint (ADR-0010).
 *
 * Development-phase gated per ADR-0002: when the config is evaluated outside
 * `next dev` (`NODE_ENV !== "development"`), the original configuration
 * object is returned untouched and nothing is registered, spawned, or
 * injected. Production builds cannot observe Nudge UI.
 *
 * The wrapper is written against a structural subset of Next's config types
 * so this package stays typecheckable without `next` installed; consumers
 * pass their real NextConfig object straight through.
 */

/** Structural subset of Next.js config this wrapper reads and writes. */
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

const NAMESPACE_PREFIX = "/__nudge_ui__";

const SUPPORTED_NEXT_RANGE = ">=15.3 <17";

/**
 * Both compilers register the esbuild-bundled CommonJS loaders from
 * `dist/loaders/` (built by `pnpm --filter @nudge-ui/nextjs build`):
 *
 * - Turbopack's LoaderRunner requires the module itself to be the loader
 *   function (CJS emission), and Node 20 cannot parse TypeScript sources —
 *   so the raw .cts sources are authoring truth only, never registered.
 * - Webpack cannot execute TypeScript loaders at all.
 *
 * The bundles are fully self-contained (plugin modules inlined), so no
 * runtime resolution of raw TypeScript happens on any supported Node.
 */
function loaderPaths(): { identity: string; cssInline: string; plugin: string } {
  return {
    plugin: fileURLToPath(new URL("../dist/loaders/loader-plugin.cjs", import.meta.url)),
    identity: fileURLToPath(new URL("../dist/loaders/identity-loader.cjs", import.meta.url)),
    cssInline: fileURLToPath(new URL("../dist/loaders/css-inline-loader.cjs", import.meta.url)),
  };
}

/** Absolute directory of a package installed in the host project, or null. */
function hostPackageDir(root: string, name: string): string | null {
  try {
    const require = createRequire(join(root, "package.json"));
    return dirname(require.resolve(`${name}/package.json`));
  } catch {
    return null;
  }
}

function resolveNextVersion(root: string): string | null {
  try {
    const require = createRequire(join(root, "package.json"));
    return (require("next/package.json") as { version?: string }).version ?? null;
  } catch {
    return null;
  }
}

/**
 * ADR-0010 gates instrumentation on the supported range: a RESOLVED version
 * outside it fails closed (no registration) with a diagnostic — instrumenting
 * an unsupported compiler risks breaking the host build. An unresolvable
 * version gets the benefit of the doubt and proceeds with a diagnostic,
 * since refusing to work because we could not read a version number would
 * make the adapter brittle for no safety gain.
 */
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
  // >=15.3 <17
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

/**
 * Wraps a Next.js configuration with Nudge UI instrumentation.
 *
 * Two input forms are supported:
 *
 * - **Function form (recommended):** pass `(phase) => nextConfig`; the
 *   wrapper resolves and instruments ONLY for PHASE_DEVELOPMENT_SERVER, so
 *   `NODE_ENV=development next build` cannot register instrumentation
 *   (ADR-0002) regardless of environment tricks.
 * - **Object form:** gated on NODE_ENV=development as before. Prefer the
 *   function form — the object form cannot see Next's build phase.
 *
 * @param config The application's existing configuration or a config factory.
 * @returns A configuration (or factory) to export in its place.
 */
/** Object form: instruments immediately when running in development. */
export function withNudgeUi<T extends object>(config: T): T;
/** Function form: gates instrumentation on PHASE_DEVELOPMENT_SERVER. */
export function withNudgeUi<T extends object>(
  factory: (phase: string) => T,
): (phase: string) => T;
export function withNudgeUi<T extends object>(
  config: T | ((phase: string) => T) = {} as T,
): T | ((phase: string) => T) {
  if (typeof config === "function") {
    const factory = config as (phase: string) => T;
    return (phase: string): T => {
      const resolved = factory(phase);
      if (phase !== DEVELOPMENT_SERVER_PHASE) {
        return resolved;
      }
      return instrumentConfig(resolved);
    };
  }

  // Object form: no phase information exists at evaluation time, so gate on
  // the development environment alone.
  if (process.env.NODE_ENV !== "development") {
    return config;
  }
  return instrumentConfig(config);
}

function instrumentConfig<T extends object>(config: T): T {

  // Consumers pass their real NextConfig object; the structural subset is an
  // internal view so this package stays typecheckable without next installed.
  const source = config as NudgeUiNextConfig;
  const root = process.cwd();
  // Fail closed per ADR-0010 when the resolved version is unsupported.
  if (!gateUnsupportedVersion(resolveNextVersion(root))) {
    return config;
  }

  // ensureSidecar is a per-process singleton; awaiting it wherever the port
  // is needed removes any config-evaluation race.
  const sidecarPort = (): Promise<number> =>
    ensureSidecar(root, { manifest: buildManifest({ root }), tokens: true })
      .then((handle: SidecarHandle) => handle.port)
      .catch((error: unknown) => {
        console.warn("[nudge-ui] sidecar failed to start:", error);
        return 0;
      });

  const nextConfig: NudgeUiNextConfig = { ...source };

  // --- transpilePackages -------------------------------------------------
  // Workspace Nudge UI packages ship raw TypeScript that SWC refuses to
  // compile from node_modules unless listed (see feature-plan appendix).
  const nudgeUiPackages = [
    "@nudge-ui/nextjs",
    "@nudge-ui/plugin",
    "@nudge-ui/inspector",
    "@nudge-ui/css",
  ];
  const userTranspile = Array.isArray(source.transpilePackages)
    ? source.transpilePackages
    : [];
  nextConfig.transpilePackages = [
    ...userTranspile,
    ...nudgeUiPackages.filter((name) => !userTranspile.includes(name)),
  ];

  // --- Turbopack rules (primary compiler) ---------------------------------
  const turbopackRules: Record<string, unknown> = {
    ...((source.turbopack?.rules as Record<string, unknown> | undefined) ?? {}),
  };
  const paths = loaderPaths();
  if (process.env.NUDGE_UI_NEXT_TURBOPACK_RULES !== "0") {
    const identityRule = {
      loaders: [{ loader: paths.plugin, options: { root } }],
      // 'foreign' is Turbopack's builtin condition for dependency code, so
      // `not: foreign` confines the loader to first-party sources. The path
      // guard additionally keeps build output (.next) out of scope.
      condition: {
        all: [
          { not: "foreign" },
          { not: { path: "(**/)?\\.next/**" } },
          // Workspace symlinks are NOT foreign (they are source-backed), so
          // the Nudge UI packages themselves must be excluded explicitly:
          // instrumenting the inspector's own UI would wrap every control in
          // override boundaries and pollute the panel with identity attrs.
          {
            not: {
              path: "[\\/]packages[\\/](inspector|nextjs|plugin|css|standalone|compatibility|package-css-fixture)[\\/]",
            },
          },
        ],
      },
    };
    /**
     * Rules are COMPOSED with any user rule for the same key by building a
     * rule collection (Next supports arrays of items per glob) — silently
     * overwriting host configuration is never acceptable.
     */
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

    // Vite's `*.css?inline` convention: the inspector imports its shadow
    // stylesheets as TEXT. Under Next, a loaders rule keyed on the query
    // turns those requests into default-export string modules; unqueried
    // CSS flows through Next's normal pipeline untouched.
    compose("*.css", {
      loaders: [{ loader: paths.cssInline }],
      condition: { query: /[?&]inline(?=&|$)/ },
      // The loader emits a JavaScript string module; without the rename the
      // result is still routed through PostCSS and fails to parse.
      as: "*.js",
    });
  }
  // --- Single React instance (ADR-0004 via module resolution) -------------
  // Nudge UI packages carry their own react dependency for standalone
  // consumers. Without an alias, SWC resolves their `react` imports against
  // those copies while the host application runs its own — two Reacts in one
  // document, and inspector state updates silently stop rendering. Aliasing
  // to the host project's copies pins one instance for every compilation.
  const hostReact = hostPackageDir(root, "react");
  const hostReactDom = hostPackageDir(root, "react-dom");
  if (hostReact || hostReactDom) {
    const userAlias = (source.turbopack?.resolveAlias as Record<string, unknown> | undefined) ?? {};
    nextConfig.turbopack = {
      ...nextConfig.turbopack,
      resolveAlias: {
        ...(hostReact ? { react: hostReact } : {}),
        ...(hostReactDom ? { "react-dom": hostReactDom } : {}),
        ...userAlias,
      },
    };
  }

  nextConfig.turbopack = {
    ...(nextConfig.turbopack ?? {}),
    rules: turbopackRules,
  };

  // --- Webpack mode (secondary target, Stage 6 verifies parity) ----------
  const userWebpack = source.webpack;
  nextConfig.webpack = (webpackConfig: Record<string, unknown>, context: { dev: boolean }) => {
    const merged = userWebpack ? userWebpack(webpackConfig, context) : webpackConfig;
    if (!context.dev) return merged;
    const module = (merged.module ?? {}) as Record<string, unknown>;
    const rules = Array.isArray(module.rules) ? [...(module.rules as unknown[])] : [];
    const paths = loaderPaths();
    // Next 16 removed the webpack CSS pipeline entirely
    // (nextjs.org/docs/messages/built-in-css-disabled): applications using
    // stylesheets cannot run under `next dev --webpack` on 16 at all,
    // with or without Nudge UI. Registration stays so Next 15.x within
    // the supported range keeps working; flag the combination loudly.
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
      use: [{ loader: paths.identity, options: { root } }],
    });
    // Vite's ?inline convention for the inspector shadow stylesheets; output
    // is a JS string module, so the rule must override the CSS module type.
    rules.push({
      test: /\.css$/,
      resourceQuery: /inline/,
      type: "javascript/auto",
      enforce: "pre",
      use: [{ loader: paths.cssInline }],
    });
    return { ...merged, module: { ...module, rules } };
  };

  // --- Manifest transport rewrite ----------------------------------------
  const proxyRewrite = (port: number): RewritesSource => ({
    source: "/__nudge_ui__/:path*",
    destination: `http://127.0.0.1:${port}/__nudge_ui__/:path*`,
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
      // Port 0 (sidecar failed to bind) yields a dead destination; the mount
      // surfaces an honest fetch failure instead of silently pretending to
      // work.
      beforeFiles: [proxyRewrite(port), ...(shape.beforeFiles ?? [])],
      afterFiles: shape.afterFiles ?? [],
      fallback: shape.fallback ?? [],
    };
  };

  // Preserve callability while keeping our async resolver.
  nextConfig.rewrites = resolveRewrites;

  // The structural view carries every original field through the spread;
  // consumers keep their NextConfig typing via the generic passthrough.
  return nextConfig as T;
}
