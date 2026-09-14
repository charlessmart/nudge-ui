import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEVELOPMENT_SERVER_PHASE,
  withNudgeUi,
  type NudgeUiNextConfig,
} from "./wrapper.ts";
import { buildManifest, nextjsProjectId } from "./manifest.ts";
import { nudgeUiRepositoryPackagePath } from "./repositoryScope.ts";

/**
 * Where `pnpm --filter nudge-ui build` writes the bundled CommonJS loaders. The
 * registered paths are asserted exactly: a merely plausible suffix let a wrong
 * directory ship once.
 */
const loaderDirectory = fileURLToPath(new URL("../../../dist/hosts/next/loaders/", import.meta.url));

function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), "next-wrapper-"));
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify({ name: "fixture", dependencies: { next: "16.3.2" } })}\n`,
  );
  return root;
}

function resolveForDevelopment<T extends object>(config: T): T {
  return withNudgeUi(config)(DEVELOPMENT_SERVER_PHASE);
}

describe("withNudgeUi — phase gating (ADR-0002)", () => {
  it("returns the original config untouched outside development", () => {
    vi.stubEnv("NODE_ENV", "production");
    const config = { reactStrictMode: true } as NudgeUiNextConfig;

    const wrapped = withNudgeUi(config);
    expect(typeof wrapped).toBe("function");
    const result = wrapped("phase-production-server");

    expect(result).toBe(config);
    expect((result as NudgeUiNextConfig).turbopack).toBeUndefined();
    vi.unstubAllEnvs();
  });

  it("keeps the object form inert during a production build", () => {
    vi.stubEnv("NODE_ENV", "development");
    const config = { reactStrictMode: true } as NudgeUiNextConfig;

    const wrapped = withNudgeUi(config);
    expect(typeof wrapped).toBe("function");
    const result = wrapped("phase-production-build");

    expect(result).toBe(config);
    expect(result.turbopack).toBeUndefined();
    vi.unstubAllEnvs();
  });

  it("keeps the object form inert during a production server phase", () => {
    vi.stubEnv("NODE_ENV", "development");
    const config = { reactStrictMode: true } as NudgeUiNextConfig;

    const wrapped = withNudgeUi(config);
    const result = wrapped("phase-production-server");

    expect(result).toBe(config);
    expect(result.turbopack).toBeUndefined();
    vi.unstubAllEnvs();
  });

  it("function form instruments only for the development-server phase", () => {
    vi.stubEnv("NODE_ENV", "development");
    const factory = vi.fn(() => ({ reactStrictMode: true }) as NudgeUiNextConfig);
    const wrapped = withNudgeUi(factory);

    expect(typeof wrapped).toBe("function");

    // A production-build phase must pass the config through untouched.
    const prodResult = (wrapped as (phase: string) => NudgeUiNextConfig)(
      "phase-production-build",
    );
    expect(prodResult).toEqual({ reactStrictMode: true });
    expect(prodResult.turbopack).toBeUndefined();
    expect(factory).toHaveBeenCalledWith("phase-production-build");

    // The development-server phase instruments.
    const devResult = (wrapped as (phase: string) => NudgeUiNextConfig)(
      "phase-development-server",
    );
    expect(devResult.turbopack).toBeDefined();
    vi.unstubAllEnvs();
  });

  it("keeps the function form inert when NODE_ENV is production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const factory = vi.fn(() => ({ reactStrictMode: true }) as NudgeUiNextConfig);
    const wrapped = withNudgeUi(factory);

    const result = (wrapped as (phase: string) => NudgeUiNextConfig)(
      DEVELOPMENT_SERVER_PHASE,
    );

    expect(result).toEqual({ reactStrictMode: true });
    expect(result.turbopack).toBeUndefined();
    expect(factory).toHaveBeenCalledWith(DEVELOPMENT_SERVER_PHASE);
    vi.unstubAllEnvs();
  });
});

describe("withNudgeUi — development output shape", () => {
  let projectRoots: string[] = [];

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    for (const root of projectRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function wrapperFor(): NudgeUiNextConfig {
    const root = makeProject();
    projectRoots.push(root);
    vi.spyOn(process, "cwd").mockReturnValue(root);
    return resolveForDevelopment({} as NudgeUiNextConfig);
  }

  it("registers the identity loader as a Turbopack rule confined to first-party sources", () => {
    const config = wrapperFor();

    const rules = config.turbopack?.rules as Record<
      string,
      { loaders?: unknown[]; condition?: unknown }
    >;
    // Two plain globs: Turbopack's rule globber does not promise brace
    // expansion, and a malformed key degrades into directory matches.
    for (const key of ["*.tsx", "*.jsx"]) {
      const rule = rules[key];
      expect(rule).toBeDefined();
      expect((rule!.loaders as Array<{ loader: string }>)[0]?.loader).toBe(
        join(loaderDirectory, "loader-plugin.cjs"),
      );
      expect(rule!.condition).toEqual({
        all: [
          { not: "foreign" },
          { not: { path: "(**/)?\\.next/**" } },
          {
            not: {
              path: nudgeUiRepositoryPackagePath,
            },
          },
        ],
      });
    }
    expect(rules["*.css"]).toBeUndefined();
    const componentRuntimeAlias = (config.turbopack?.resolveAlias as Record<string, unknown>)[
      "nudge-ui/component-runtime"
    ];
    expect(componentRuntimeAlias).toEqual(expect.stringMatching(/reactRuntime\.(?:js|tsx)$/));
    // Turbopack treats absolute filesystem aliases as malformed relative
    // imports. The alias must be project-relative for both flat projects and
    // workspace source files.
    expect(componentRuntimeAlias).toMatch(/^\.\.?\//);
  });

  it("preserves user Turbopack aliases alongside the runtime alias", () => {
    const root = makeProject();
    projectRoots.push(root);
    vi.spyOn(process, "cwd").mockReturnValue(root);

    const config = resolveForDevelopment({
      turbopack: {
        rules: { "**/*.svg": { loaders: ["svg-loader"] } },
        resolveAlias: { "@app/*": "./src/*" },
      },
    } as NudgeUiNextConfig);

    expect(config.turbopack?.resolveAlias).toEqual(expect.objectContaining({
      "@app/*": "./src/*",
      "nudge-ui/component-runtime": expect.stringMatching(/reactRuntime\.(?:js|tsx)$/),
    }));
  });

  it("passes host component protocols to both compiler integrations", () => {
    const root = makeProject();
    projectRoots.push(root);
    vi.spyOn(process, "cwd").mockReturnValue(root);
    const componentProtocols = {
      "structural-library": {
        exports: { Provider: { wrap: false, slots: { children: "rendered" } } },
      },
    } as const;
    const config = withNudgeUi({} as NudgeUiNextConfig, { componentProtocols })(
      DEVELOPMENT_SERVER_PHASE,
    );
    const rules = config.turbopack?.rules as Record<
      string,
      { loaders: Array<{ options: { componentProtocols?: unknown } }> }
    >;

    expect(rules["*.tsx"]?.loaders[0]?.options.componentProtocols).toBe(componentProtocols);

    const webpackHook = config.webpack;
    expect(webpackHook).toBeTypeOf("function");
    if (!webpackHook) throw new Error("Expected the Next Adapter to install a webpack hook.");
    const webpackOut = webpackHook({ module: {} }, { dev: true });
    const webpackRules = (webpackOut.module as { rules?: Array<{
      use: Array<{ options: { componentProtocols?: unknown } }>;
    }> }).rules;
    expect(webpackRules?.[0]?.use[0]?.options.componentProtocols).toBe(componentProtocols);
  });

  it("resolves explicit workspace source roots for the loader Adapter", () => {
    const root = makeProject();
    projectRoots.push(root);
    vi.spyOn(process, "cwd").mockReturnValue(root);
    const config = withNudgeUi({} as NudgeUiNextConfig, {
      sourceRoots: ["../design-system/src"],
    })(DEVELOPMENT_SERVER_PHASE);
    const rules = config.turbopack?.rules as Record<
      string,
      { loaders: Array<{ options: { sourceRoots?: readonly string[] } }> }
    >;

    expect(rules["*.tsx"]?.loaders[0]?.options.sourceRoots).toEqual([
      join(root, "../design-system/src"),
    ]);
  });

  it("preserves user turbopack rules alongside the injected one", () => {
    const root = mkdtempSync(join(tmpdir(), "next-wrapper-"));
    projectRoots.push(root);
    vi.spyOn(process, "cwd").mockReturnValue(root);

    const config = resolveForDevelopment({
      turbopack: { rules: { "**/*.svg": { loaders: ["svg-loader"] } } },
    } as NudgeUiNextConfig);

    const rules = config.turbopack?.rules as Record<string, unknown>;
    expect(rules["**/*.svg"]).toBeDefined();
    expect(rules["*.tsx"]).toBeDefined();

    // A USER rule for the SAME key composes into a collection instead of
    // being overwritten.
    const shared = resolveForDevelopment({
      turbopack: { rules: { "*.tsx": { loaders: ["user-loader"] } } },
    } as NudgeUiNextConfig) as {
      turbopack?: { rules?: Record<string, Array<Record<string, unknown>>> };
    };
    const composed = shared.turbopack?.rules?.["*.tsx"] as Array<Record<string, unknown>>;
    expect(Array.isArray(composed)).toBe(true);
    expect(composed.some((r) => JSON.stringify(r).includes("user-loader"))).toBe(true);
  });

  it("composes the webpack hook and only instruments in dev contexts", () => {
    const userHook = vi.fn((base: Record<string, unknown>) => base);
    const composed = resolveForDevelopment({ webpack: userHook } as NudgeUiNextConfig);

    expect(typeof composed.webpack).toBe("function");
    expect(composed.webpack).not.toBe(userHook);

    // The hook RETURNS a new config (Next's contract); rules live there.
    const devConfig: Record<string, unknown> = { module: {} };
    const devOut = (
      composed.webpack as (c: Record<string, unknown>, ctx: { dev: boolean }) => Record<string, unknown>
    )(devConfig, { dev: true });
    expect(userHook).toHaveBeenCalled();

    const rules = ((devOut.module as { rules?: unknown[] }).rules ?? []) as Array<Record<string, unknown>>;
    expect(rules).toHaveLength(1);
    // Identity rule for first-party TSX/JSX. The inspector client is served
    // as a prebuilt asset, so Next must not receive a CSS query rule.
    expect(rules[0]?.test).toEqual(/\.(tsx|jsx)$/);
    expect((rules[0]?.use as Array<{ loader: string }>)[0]?.loader).toBe(
      join(loaderDirectory, "identity-loader.cjs"),
    );
    expect((devOut.resolve as { alias?: Record<string, unknown> }).alias).toEqual(
      expect.objectContaining({
        "nudge-ui/component-runtime": expect.stringMatching(/reactRuntime\.(?:js|tsx)$/),
      }),
    );

    // Production context must stay untouched.
    const prodConfig: Record<string, unknown> = { module: { rules: ["keep"] } };
    const prodOut = (
      composed.webpack as (c: Record<string, unknown>, ctx: { dev: boolean }) => Record<string, unknown>
    )(prodConfig, { dev: false });
    expect(prodOut).toEqual(prodConfig);
    expect((prodOut.module as { rules: unknown[] }).rules).toEqual(["keep"]);
  });

  it("merges transpilePackages without clobbering user entries", () => {
    const config = wrapperFor();

    const transpile = config.transpilePackages as string[];
    for (const required of [
      "nudge-ui",
      "../../inspector/index.ts",
      "../../css/index.ts",
    ]) {
      expect(transpile).toContain(required);
    }
    expect(transpile).not.toContain("../vite/index.ts");
  });

  it("proxies /__nudge_ui__ to a live loopback sidecar before user rewrites", async () => {
    const config = wrapperFor();

    const resolved = await (config.rewrites as () => Promise<{
      beforeFiles: Array<{ source: string; destination: string }>;
      afterFiles: unknown[];
    }>)();

    const proxy = resolved.beforeFiles[0];
    expect(proxy?.source).toBe("/__nudge_ui__/:path*");
    expect(proxy?.destination).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/__nudge_ui__/);
    expect(Number(proxy!.destination.match(/:(\d+)/)?.[1])).toBeGreaterThan(0);

    // The transport is live end-to-end.
    const port = Number(proxy!.destination.match(/:(\d+)/)?.[1]);
    const response = await fetch(`http://127.0.0.1:${port}/__nudge_ui__/manifest`);
    const manifest = (await response.json()) as {
      runtime?: { projectId?: string; host?: string };
    };
    expect(manifest.runtime?.host).toBe("nextjs-react");
    expect(manifest.runtime?.projectId).toMatch(/^nextjs:[0-9a-f]{24}$/);
  });

  it("shadows reserved-namespace user rewrites and keeps their other entries", async () => {
    const root = mkdtempSync(join(tmpdir(), "next-wrapper-"));
    projectRoots.push(root);
    vi.spyOn(process, "cwd").mockReturnValue(root);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const config = resolveForDevelopment({
      rewrites: async () => ({
        beforeFiles: [{ source: "/__nudge_ui__/evil", destination: "/elsewhere" }],
        afterFiles: [{ source: "/blog/:slug", destination: "/posts/:slug" }],
      }),
    } as NudgeUiNextConfig);

    const resolved = await (config.rewrites as () => Promise<{
      beforeFiles: Array<{ source: string }>;
      afterFiles: Array<{ source: string }>;
    }>)();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("reserved namespace"), [
      "/__nudge_ui__/evil",
    ]);
    expect(resolved.beforeFiles.map((rule) => rule.source)).toContain("/__nudge_ui__/:path*");
    expect(resolved.afterFiles.map((rule) => rule.source)).toContain("/blog/:slug");
  });

  it("warns when the resolved Next version is unsupported", async () => {
    const root = mkdtempSync(join(tmpdir(), "next-wrapper-"));
    mkdirSync(join(root, "node_modules", "next"), { recursive: true });
    writeFileSync(
      join(root, "node_modules", "next", "package.json"),
      `${JSON.stringify({ name: "next", version: "14.2.0" })}\n`,
    );
    projectRoots.push(root);
    vi.spyOn(process, "cwd").mockReturnValue(root);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const config = resolveForDevelopment({} as NudgeUiNextConfig);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("outside the tested range"));
    // Failing closed: unsupported versions get NO instrumentation.
    expect(config.turbopack).toBeUndefined();
    warnSpy.mockRestore();
  });
});

describe("manifest builder", () => {
  it("derives a deterministic namespaced projectId from the root", () => {
    expect(nextjsProjectId("/a/b")).toBe(nextjsProjectId("/a/b"));
    expect(nextjsProjectId("/a/b")).not.toBe(nextjsProjectId("/a/c"));
    expect(nextjsProjectId("/a/b")).toMatch(/^nextjs:/);
  });

  it("ships the tracer-bullet capability set with empty knowledge fields", () => {
    const manifest = buildManifest({ root: "/x" });

    // Canvas shares the Vite host's controller/renderer runtime; semantic
    // component props cover client components only.
    expect(manifest.runtime.capabilities).toEqual({ canvas: true, componentSemantics: true });
    expect(manifest.runtime.tokenCatalog).toEqual([]);
    expect(manifest.runtime.componentContracts).toEqual([]);
    expect(manifest.runtime.framework).toBe("React");
  });
});

afterAll(() => {
  // No persistent resources: the sidecar singleton dies with the worker.
});
