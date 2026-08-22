import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { ensureSidecar, type SidecarHandle } from "./sidecar.ts";
import { buildManifest } from "./manifest.ts";

/**
 * `withDesignTool(nextConfig)` — the single user touchpoint (ADR-0010).
 *
 * Development-phase gated per ADR-0002: when the config is evaluated outside
 * `next dev` (`NODE_ENV !== "development"`), the original configuration
 * object is returned untouched and nothing is registered, spawned, or
 * injected. Production builds cannot observe Design Tool.
 *
 * The wrapper is written against a structural subset of Next's config types
 * so this package stays typecheckable without `next` installed; consumers
 * pass their real NextConfig object straight through.
 */

/** Structural subset of Next.js config this wrapper reads and writes. */
export interface DesignToolNextConfig {
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

const NAMESPACE_PREFIX = "/__design_tool__";

const SUPPORTED_NEXT_RANGE = ">=15.3 <17";

function loaderPluginPath(): string {
  // .cts: Turbopack's LoaderRunner requires the module itself to be the
  // loader function (CJS emission), not an ESM default export.
  return fileURLToPath(new URL("./loader-plugin.cts", import.meta.url));
}

function cssInlineLoaderPath(): string {
  return fileURLToPath(new URL("./css-inline-loader.cts", import.meta.url));
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

function warnUnsupportedVersion(version: string | null): void {
  if (version && isVersionSupported(version)) return;
  console.warn(
    `[design-tool] Next.js ${version ?? "(version unavailable)"} is outside the tested range `
      + `${SUPPORTED_NEXT_RANGE} (ADR-0010). Instrumentation will still register; if the dev `
      + `server misbehaves, remove withDesignTool() and file an issue.`,
  );
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

/**
 * Wraps a Next.js configuration with Design Tool instrumentation.
 *
 * @param config The application's existing configuration (may be undefined).
 * @returns A configuration to export in its place.
 */
export function withDesignTool<T extends object>(config: T = {} as T): T {
  // ADR-0002 phase gate. next build evaluates this module with production.
  if (process.env.NODE_ENV !== "development") {
    return config;
  }

  // Consumers pass their real NextConfig object; the structural subset is an
  // internal view so this package stays typecheckable without next installed.
  const source = config as DesignToolNextConfig;
  const root = process.cwd();
  warnUnsupportedVersion(resolveNextVersion(root));

  // ensureSidecar is a per-process singleton; awaiting it wherever the port
  // is needed removes any config-evaluation race.
  const sidecarPort = (): Promise<number> =>
    ensureSidecar(root, { manifest: buildManifest({ root }), tokens: true })
      .then((handle: SidecarHandle) => handle.port)
      .catch((error: unknown) => {
        console.warn("[design-tool] sidecar failed to start:", error);
        return 0;
      });

  const nextConfig: DesignToolNextConfig = { ...source };

  // --- transpilePackages -------------------------------------------------
  // Workspace Design Tool packages ship raw TypeScript that SWC refuses to
  // compile from node_modules unless listed (see feature-plan appendix).
  const designToolPackages = [
    "@design-tool/nextjs",
    "@design-tool/plugin",
    "@design-tool/inspector",
    "@design-tool/css",
  ];
  const userTranspile = Array.isArray(source.transpilePackages)
    ? source.transpilePackages
    : [];
  nextConfig.transpilePackages = [
    ...userTranspile,
    ...designToolPackages.filter((name) => !userTranspile.includes(name)),
  ];

  // --- Turbopack rules (primary compiler) ---------------------------------
  const turbopackRules: Record<string, unknown> = {
    ...((source.turbopack?.rules as Record<string, unknown> | undefined) ?? {}),
  };
  if (process.env.DT_NEXT_TURBOPACK_RULES !== "0") {
    const identityRule = {
      loaders: [{ loader: loaderPluginPath(), options: { root } }],
      // 'foreign' is Turbopack's builtin condition for dependency code, so
      // `not: foreign` confines the loader to first-party sources. The path
      // guard additionally keeps build output (.next) out of scope.
      condition: {
        all: [
          { not: "foreign" },
          { not: { path: "(**/)?\\.next/**" } },
          // Workspace symlinks are NOT foreign (they are source-backed), so
          // the Design Tool packages themselves must be excluded explicitly:
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
    turbopackRules["*.tsx"] = { ...identityRule };
    turbopackRules["*.jsx"] = { ...identityRule };

    // Vite's `*.css?inline` convention: the inspector imports its shadow
    // stylesheets as TEXT. Under Next, a loaders rule keyed on the query
    // turns those requests into default-export string modules; unqueried
    // CSS flows through Next's normal pipeline untouched.
    turbopackRules["*.css"] = {
      loaders: [{ loader: cssInlineLoaderPath() }],
      condition: { query: /[?&]inline(?=&|$)/ },
      // The loader emits a JavaScript string module; without the rename the
      // result is still routed through PostCSS and fails to parse.
      as: "*.js",
    };
  }
  // --- Single React instance (ADR-0004 via module resolution) -------------
  // Design Tool packages carry their own react dependency for standalone
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
    rules.push({
      test: /\.(tsx|jsx)$/,
      exclude: /node_modules/,
      enforce: "pre",
      use: [{ loader: loaderPluginPath(), options: { root } }],
    });
    return { ...merged, module: { ...module, rules } };
  };

  // --- Manifest transport rewrite ----------------------------------------
  const proxyRewrite = (port: number): RewritesSource => ({
    source: "/__design_tool__/:path*",
    destination: `http://127.0.0.1:${port}/__design_tool__/:path*`,
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
        "[design-tool] /__design_tool__ is a reserved namespace (ADR-0010); "
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
