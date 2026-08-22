import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withDesignTool, type DesignToolNextConfig } from "./wrapper.ts";
import { buildManifest, nextjsProjectId } from "./manifest.ts";

function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), "dt-next-wrapper-"));
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify({ name: "fixture", dependencies: { next: "16.3.2" } })}\n`,
  );
  return root;
}

describe("withDesignTool — phase gating (ADR-0002)", () => {
  it("returns the original config untouched outside development", () => {
    vi.stubEnv("NODE_ENV", "production");
    const config = { reactStrictMode: true } as DesignToolNextConfig;

    const result = withDesignTool(config);

    expect(result).toBe(config);
    expect(result.turbopack).toBeUndefined();
    vi.unstubAllEnvs();
  });

  it("function form instruments only for the development-server phase", () => {
    vi.stubEnv("NODE_ENV", "development");
    const factory = vi.fn(() => ({ reactStrictMode: true }) as DesignToolNextConfig);
    const wrapped = withDesignTool(factory);

    expect(typeof wrapped).toBe("function");

    // A production-build phase must pass the config through untouched.
    const prodResult = (wrapped as (phase: string) => DesignToolNextConfig)(
      "phase-production-build",
    );
    expect(prodResult).toEqual({ reactStrictMode: true });
    expect(prodResult.turbopack).toBeUndefined();
    expect(factory).toHaveBeenCalledWith("phase-production-build");

    // The development-server phase instruments.
    const devResult = (wrapped as (phase: string) => DesignToolNextConfig)(
      "phase-development-server",
    );
    expect(devResult.turbopack).toBeDefined();
    vi.unstubAllEnvs();
  });
});

describe("withDesignTool — development output shape", () => {
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

  function wrapperFor(): DesignToolNextConfig {
    const root = makeProject();
    projectRoots.push(root);
    vi.spyOn(process, "cwd").mockReturnValue(root);
    return withDesignTool({} as DesignToolNextConfig);
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
      expect((rule!.loaders as Array<{ loader: string }>)[0]?.loader).toMatch(
        /dist[\\/]+loaders[\\/]loader-plugin\.cjs$/,
      );
      expect(rule!.condition).toEqual({
        all: [
          { not: "foreign" },
          { not: { path: "(**/)?\\.next/**" } },
          {
            not: {
              path:
                "[\\/]packages[\\/](inspector|nextjs|plugin|css|standalone|compatibility|package-css-fixture)[\\/]",
            },
          },
        ],
      });
    }
  });

  it("preserves user turbopack rules alongside the injected one", () => {
    const root = mkdtempSync(join(tmpdir(), "dt-next-wrapper-"));
    projectRoots.push(root);
    vi.spyOn(process, "cwd").mockReturnValue(root);

    const config = withDesignTool({
      turbopack: { rules: { "**/*.svg": { loaders: ["svg-loader"] } } },
    } as DesignToolNextConfig);

    const rules = config.turbopack?.rules as Record<string, unknown>;
    expect(rules["**/*.svg"]).toBeDefined();
    expect(rules["*.tsx"]).toBeDefined();

    // A USER rule for the SAME key composes into a collection instead of
    // being overwritten.
    const shared = withDesignTool({
      turbopack: { rules: { "*.tsx": { loaders: ["user-loader"] } } },
    } as DesignToolNextConfig) as {
      turbopack?: { rules?: Record<string, Array<Record<string, unknown>>> };
    };
    const composed = shared.turbopack?.rules?.["*.tsx"] as Array<Record<string, unknown>>;
    expect(Array.isArray(composed)).toBe(true);
    expect(composed.some((r) => JSON.stringify(r).includes("user-loader"))).toBe(true);
  });

  it("composes the webpack hook and only instruments in dev contexts", () => {
    const userHook = vi.fn((base: Record<string, unknown>) => base);
    const composed = withDesignTool({ webpack: userHook } as DesignToolNextConfig);

    expect(typeof composed.webpack).toBe("function");
    expect(composed.webpack).not.toBe(userHook);

    // The hook RETURNS a new config (Next's contract); rules live there.
    const devConfig: Record<string, unknown> = { module: {} };
    const devOut = (
      composed.webpack as (c: Record<string, unknown>, ctx: { dev: boolean }) => Record<string, unknown>
    )(devConfig, { dev: true });
    expect(userHook).toHaveBeenCalled();

    const rules = ((devOut.module as { rules?: unknown[] }).rules ?? []) as Array<Record<string, unknown>>;
    expect(rules).toHaveLength(2);
    // Identity rule for first-party TSX/JSX...
    expect(rules[0]?.test).toEqual(/\.(tsx|jsx)$/);
    expect((rules[0]?.use as Array<{ loader: string }>)[0]?.loader).toMatch(/identity-loader\.cjs$/);
    // ...and the ?inline CSS rule feeding the shadow stylesheets.
    expect(rules[1]?.resourceQuery).toEqual(/inline/);
    expect((rules[1]?.use as Array<{ loader: string }>)[0]?.loader).toMatch(/css-inline-loader\.cjs$/);

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
      "@design-tool/nextjs",
      "@design-tool/plugin",
      "@design-tool/inspector",
      "@design-tool/css",
    ]) {
      expect(transpile).toContain(required);
    }
  });

  it("proxies /__design_tool__ to a live loopback sidecar before user rewrites", async () => {
    const config = wrapperFor();

    const resolved = await (config.rewrites as () => Promise<{
      beforeFiles: Array<{ source: string; destination: string }>;
      afterFiles: unknown[];
    }>)();

    const proxy = resolved.beforeFiles[0];
    expect(proxy?.source).toBe("/__design_tool__/:path*");
    expect(proxy?.destination).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/__design_tool__/);
    expect(Number(proxy!.destination.match(/:(\d+)/)?.[1])).toBeGreaterThan(0);

    // The transport is live end-to-end.
    const port = Number(proxy!.destination.match(/:(\d+)/)?.[1]);
    const response = await fetch(`http://127.0.0.1:${port}/__design_tool__/manifest`);
    const manifest = (await response.json()) as { projectId?: string; host?: string };
    expect(manifest.host).toBe("nextjs-react");
    expect(manifest.projectId).toMatch(/^nextjs:[0-9a-f]{12}$/);
  });

  it("shadows reserved-namespace user rewrites and keeps their other entries", async () => {
    const root = mkdtempSync(join(tmpdir(), "dt-next-wrapper-"));
    projectRoots.push(root);
    vi.spyOn(process, "cwd").mockReturnValue(root);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const config = withDesignTool({
      rewrites: async () => ({
        beforeFiles: [{ source: "/__design_tool__/evil", destination: "/elsewhere" }],
        afterFiles: [{ source: "/blog/:slug", destination: "/posts/:slug" }],
      }),
    } as DesignToolNextConfig);

    const resolved = await (config.rewrites as () => Promise<{
      beforeFiles: Array<{ source: string }>;
      afterFiles: Array<{ source: string }>;
    }>)();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("reserved namespace"), [
      "/__design_tool__/evil",
    ]);
    expect(resolved.beforeFiles.map((rule) => rule.source)).toContain("/__design_tool__/:path*");
    expect(resolved.afterFiles.map((rule) => rule.source)).toContain("/blog/:slug");
  });

  it("warns when the resolved Next version is unsupported", async () => {
    const root = mkdtempSync(join(tmpdir(), "dt-next-wrapper-"));
    mkdirSync(join(root, "node_modules", "next"), { recursive: true });
    writeFileSync(
      join(root, "node_modules", "next", "package.json"),
      `${JSON.stringify({ name: "next", version: "14.2.0" })}\n`,
    );
    projectRoots.push(root);
    vi.spyOn(process, "cwd").mockReturnValue(root);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const config = withDesignTool({} as DesignToolNextConfig);

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

    // Stage 5 enables semantic component props for client components.
    expect(manifest.capabilities).toEqual({ canvas: false, componentSemantics: true });
    expect(manifest.tokenCatalog).toEqual([]);
    expect(manifest.componentContracts).toEqual([]);
    expect(manifest.framework).toBe("React");
  });
});

afterAll(() => {
  // No persistent resources: the sidecar singleton dies with the worker.
});
