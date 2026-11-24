import { describe, it, expect, onTestFinished, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createTokenInventory } from "../../css/token-inventory/index.ts";
import { createServer, mergeConfig } from "vite";
import {
  nudgeUi as createNudgeUiPlugins,
  extractViteModuleCss,
  isHostApplicationSource,
  transformIndexHtmlHtml,
  withNudgeUi,
} from "./index.ts";
import { interpretDialects } from "../../css/dialects/index.ts";
import { REACT_RENDERER_CAPTURE_SCRIPT } from "../reactRendererCapture.ts";
import { DOCUMENT_HEAD_SCRIPT } from "../../inspector/canvas/documentHeadScript.ts";

const nudgeUi = (...args: Parameters<typeof createNudgeUiPlugins>) =>
  createNudgeUiPlugins(...args)[0]!;

/** The hooks these tests drive on the main plugin. */
interface DevPlugin {
  configResolved(config: { root: string; command: "serve" | "build"; mode?: string; build?: { outDir?: string } }): void;
  configureServer(server: unknown): void;
  buildStart(): void;
  resolveId(id: string): string | null;
  load(id: string): string | null | Promise<string | null>;
  handleHotUpdate(context: { file: string; read(): Promise<string>; server: unknown; modules: unknown[]; timestamp?: number }): Promise<unknown>;
  transformIndexHtml(html: string): string | undefined;
}

const devPlugin = (...args: Parameters<typeof createNudgeUiPlugins>) => nudgeUi(...args) as unknown as DevPlugin;

function startDevServer(plugin: Pick<DevPlugin, "configResolved" | "configureServer" | "buildStart">, root: string, server: unknown): void {
  plugin.configResolved({ root, command: "serve" });
  plugin.configureServer(server);
  plugin.buildStart();
}

/** A dev server whose resolver and transforms do nothing. */
function nullServer(moduleGraph?: unknown) {
  return { pluginContainer: { resolveId: async () => null }, transformRequest: async () => null, ...(moduleGraph ? { moduleGraph } : {}) };
}

function parseTokenCatalog<T>(code: string | null | undefined): T[] {
  return JSON.parse(code?.match(/^export const tokenCatalog = (.*);$/m)?.[1] ?? "[]") as T[];
}

/** A temporary directory removed when the current test finishes. */
function tempDir(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

interface ThemeContractFixture {
  vars: Record<string, unknown>;
}

function activeModuleGraph(...ids: string[]) {
  return {
    idToModuleMap: new Map(ids.map((id) => [id, { id, importers: new Set([{}]) }])),
  };
}

const SAMPLE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <title>Sandbox</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

function codeContainsName(code: string | null | undefined, name: string): boolean {
  return code?.includes(JSON.stringify(name)) ?? false;
}

describe("isHostApplicationSource", () => {
  const root = join(tmpdir(), "nudge-ui-app");
  it("includes source files inside the resolved Vite root", () => {
    expect(isHostApplicationSource(
      join(root, "src/ui/Button.tsx"),
      root,
    )).toBe(true);
  });

  it("excludes workspace packages without relying on their directory names", () => {
    expect(isHostApplicationSource(
      join(root, "..", "renamed-runtime-package", "Inspector.tsx"),
      root,
    )).toBe(false);
  });

  it("excludes dependencies and virtual modules", () => {
    expect(isHostApplicationSource(
      join(root, "node_modules", "design-system", "Button.tsx"),
      root,
    )).toBe(false);
    expect(isHostApplicationSource("\0virtual:nudge-ui-inspector", root))
      .toBe(false);
  });
});

describe("Vite workspace source scope", () => {
  it("enables semantic callsite instrumentation only for explicitly owned workspace files", async () => {
    const source = `function Button() { return <button />; }
export const App = () => <Button />;`;
    const createPlugin = async (sourceRoots?: readonly string[]) => {
      const [plugin] = createNudgeUiPlugins({ sourceRoots }) as unknown as [{
        configResolved?: (config: { root: string; command: "serve"; build?: { outDir?: string } }) => void;
        transform?: { handler?: (code: string, id: string) => Promise<{ code?: string } | null> };
      }];
      plugin.configResolved?.({ root: "/repo/apps/web", command: "serve" });
      const result = await plugin.transform?.handler?.call({
        resolve: async () => null,
        warn: () => undefined,
      }, source, "/repo/packages/ui/src/App.tsx");
      return result?.code ?? "";
    };

    expect(await createPlugin()).not.toContain("__nudgeUiInstrumentComponent");
    const transformed = await createPlugin(["../../packages/ui"]);
    expect(transformed).toContain("__nudgeUiInstrumentComponent");
    // Project-root relative, so a workspace package never collides with the app's own `src/App.tsx` and no machine path is serialised.
    expect(transformed).toContain('data-src="../../packages/ui/src/App.tsx:2:27"');
  });
});

describe("transformIndexHtmlHtml", () => {
  it("injects the mount div + script before </body> in serve mode", () => {
    const out = transformIndexHtmlHtml(SAMPLE_HTML, "serve");
    expect(out).not.toBeNull();
    expect(out!).toContain('<div id="nudge-ui-root"></div>');
    expect(out!).toContain(
      '<script type="module" src="/__nudge_ui__/client.mjs" data-nudge-ui-client data-nudge-ui-manifest="/__nudge_ui__/manifest"></script>',
    );
    expect(out!.indexOf("<body>")).toBeLessThan(out!.indexOf('id="nudge-ui-root"'));
    expect(out!.indexOf('id="nudge-ui-root"')).toBeLessThan(out!.lastIndexOf("</body>"));
  });

  it("places the animation clock, then a head script, ahead of every other script", () => {
    const out = transformIndexHtmlHtml(SAMPLE_HTML, "serve", { headScript: "window.early = true;" })!;
    const clock = out.indexOf(`<script data-nudge-ui-clock>${DOCUMENT_HEAD_SCRIPT}</script>`);
    const head = out.indexOf("<script data-nudge-ui-head>window.early = true;</script>");
    expect(clock).toBeGreaterThan(out.indexOf("<head"));
    expect(out.indexOf("<script")).toBe(clock);
    expect(out.indexOf("<script", clock + 1)).toBe(head);
  });

  it("marks the mount for debug-only Inspector features when requested", () => {
    const out = transformIndexHtmlHtml(SAMPLE_HTML, "serve", { debug: true });
    expect(out).toContain('<div id="nudge-ui-root" data-nudge-ui-debug="true"></div>');
  });

  it("passes the debug option through to the injected mount", () => {
    const [plugin] = createNudgeUiPlugins({ debug: true }) as unknown as [DevPlugin];
    const out = plugin.transformIndexHtml?.(SAMPLE_HTML);
    expect(out).toContain('<div id="nudge-ui-root" data-nudge-ui-debug="true"></div>');
  });

  it.each([{}, { demo: true }])("injects React's renderer capture script ahead of the app (%o)", (options) => {
    const [plugin] = createNudgeUiPlugins(options) as unknown as [DevPlugin];
    const out = plugin.transformIndexHtml?.(SAMPLE_HTML) ?? "";
    const capture = out.indexOf(`<script data-nudge-ui-head>${REACT_RENDERER_CAPTURE_SCRIPT}</script>`);
    expect(capture).toBeGreaterThan(-1);
    // Only the animation clock runs before it.
    expect(out.indexOf("<script", out.indexOf("<script data-nudge-ui-clock>") + 1)).toBe(capture);
  });

  it("returns null in build mode (ADR-0002)", () => {
    expect(transformIndexHtmlHtml(SAMPLE_HTML, "build")).toBeNull();
  });

  it("appends the injection when </body> is absent", () => {
    const html = `<html><head></head><body><div id="root"></div></body>`;
    const noBody = `<div>no body</div>`;
    const out = transformIndexHtmlHtml(noBody, "serve");
    expect(out).not.toBeNull();
    expect(out!).toContain('<div id="nudge-ui-root"></div>');
    expect(out!.endsWith("<div id=\"nudge-ui-root\"></div>\n<script type=\"module\" src=\"/__nudge_ui__/client.mjs\" data-nudge-ui-client data-nudge-ui-manifest=\"/__nudge_ui__/manifest\"></script>\n")).toBe(true);
  });
});

describe("nudgeUi client transport", () => {
  it("serves an editor document with Vite HMR and one inspector bootstrap", async ({ onTestFinished }) => {
    const vite = await createServer({
      configFile: false,
      server: { middlewareMode: true, ws: false, watch: null, preTransformRequests: false },
      plugins: [{
        name: "inspector-bootstrap",
        transformIndexHtml: (html) => transformIndexHtmlHtml(html, "serve") ?? html,
      }],
    });
    onTestFinished(() => vite.close());
    type Middleware = (
      request: { url: string; method: string; headers?: Record<string, string> },
      response: { statusCode: number; setHeader(name: string, value: string): void; end(body?: string): void },
      next: () => void,
    ) => Promise<void>;
    let middleware: Middleware | undefined;
    const plugin = devPlugin();
    plugin.configResolved({ root: "/project", command: "serve" });
    plugin.configureServer({
      middlewares: { use: (handler: Middleware) => { middleware = handler; } },
      transformIndexHtml: vite.transformIndexHtml,
      watcher: { on: () => undefined },
    });
    let body = "";
    const response = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: (value = "") => { body = value; },
    };

    await middleware!({ url: "/__nudge_ui__/editor?url=%2Fproducts", method: "GET" }, response, vi.fn());

    expect(response.statusCode).toBe(200);
    expect(body).toContain("data-nudge-ui-editor");
    expect(body).toContain('<div id="nudge-ui-root"></div>');
    expect(body).not.toContain("products");
    expect(body).toContain('src="/@vite/client"');
    expect(body.match(/data-nudge-ui-client/g)).toHaveLength(1);

    body = "";
    await middleware!({
      url: "/products?q=linen&nudge-ui=editor",
      method: "GET",
      headers: { accept: "text/html" },
    }, response, vi.fn());
    expect(response.statusCode).toBe(200);
    expect(body).toContain("data-nudge-ui-editor");
  });

  it("rejects non-GET requests to reserved client routes", async () => {
    type Middleware = (
      request: { url: string; method: string },
      response: { statusCode: number; setHeader(name: string, value: string | number): void; end(): void },
      next: () => void,
    ) => Promise<void>;
    let middleware: Middleware | undefined;
    const plugin = devPlugin();
    plugin.configResolved({ root: "/project", command: "serve" });
    plugin.configureServer({
      middlewares: { use: (handler: Middleware) => { middleware = handler; } },
      watcher: { on: () => undefined },
    });
    const response = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
    const next = vi.fn();

    await middleware!({ url: "/__nudge_ui__/manifest", method: "POST" }, response, next);

    expect(response.statusCode).toBe(405);
    expect(response.setHeader).toHaveBeenCalledWith("Allow", "GET, HEAD");
    expect(response.end).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  });
});

describe("nudgeUi plugin virtual inspector module", () => {
  it("orders identity transforms before pre plugins and CSS observation after them", () => {
    const [plugin, transformedObserver] = createNudgeUiPlugins() as unknown as [{
      enforce?: string;
      transform?: { order?: string };
    }, { enforce?: string; transform?: unknown }];
    expect(plugin.enforce).toBe("pre");
    expect(plugin.transform).toMatchObject({ order: "pre" });
    expect(transformedObserver.enforce).toBeUndefined();
    expect(typeof transformedObserver.transform).toBe("function");
  });

  it("resolveId maps both bare and resolved forms of the inspector virtual id", () => {
    const plugin = devPlugin();
    expect(plugin.resolveId!("virtual:nudge-ui-inspector")).toBe(
      "\0virtual:nudge-ui-inspector",
    );
    expect(plugin.resolveId!("\0virtual:nudge-ui-inspector")).toBe(
      "\0virtual:nudge-ui-inspector",
    );
  });

  it("emits an iframe editor bootstrap only for the explicit demo build mode", async () => {
    const plugin = devPlugin({
      demo: true,
      demoPages: ["/?landing-version=1"],
      demoCardLabels: ["V1", "Final"],
      features: { canvasIterations: false },
    });
    plugin.configResolved?.({ root: "/project", command: "build", mode: "nudge-demo" });
    const code = await plugin.load!("\0virtual:nudge-ui-inspector");
    expect(code).toContain("readNudgeUiEditorTarget(window.location.href)");
    expect(code).toContain("isCanvasRenderer()");
    // The application keeps the top document; only an explicit editor URL boots the editor.
    expect(code).not.toContain("history.replaceState");
    // The open action, panel handoff and noindex live in the inspector, so the dev editor shell shares them.
    expect(code).toContain('window.addEventListener("nudge-ui:open", () => openDemoEditor())');
    expect(code).not.toContain("sessionStorage");
    expect(code).not.toContain("noindex");
    expect(code).toContain('document.documentElement.setAttribute("data-nudge-ui-editor", "")');
    expect(code).toContain("demo: true");
    expect(code).toContain('demoPages: ["/?landing-version=1"]');
    expect(code).toContain('demoCardLabels: ["V1","Final"]');
    expect(code).toContain('features: {"canvasIterations":false}');
    expect(code).toContain("capabilities: { componentSemantics: true }");
    expect(transformIndexHtmlHtml(SAMPLE_HTML, "build", { demoBuild: true })).not.toBeNull();
  });
});

describe("nudgeUi Astro component-style unwrapping (ADR-0011)", () => {
  it("extracts the stylesheet embedded in Vite CSS-module JS wrappers", () => {
    const wrapper = [
      'import { updateStyle as __vite__updateStyle } from "/@vite/client"',
      'const __vite__css = ".card[data-astro-cid-x]{--a: \\"1px\\";--b: 2px}"',
      "__vite__updateStyle(__vite__id, __vite__css)",
      "import.meta.hot.accept()",
    ].join("\n");
    expect(extractViteModuleCss(wrapper)).toBe(
      '.card[data-astro-cid-x]{--a: "1px";--b: 2px}',
    );
  });

  it("returns null for non-wrapper code so callers feed it unchanged", () => {
    expect(extractViteModuleCss(":root { --x: 1px; }")).toBeNull();
    expect(extractViteModuleCss("const __vite__css = broken")).toBeNull();
  });

  it("feeds Astro component-style modules into the token catalog as scoped theme tables", async () => {
    const root = tempDir("nudge-ui-astro-css-");
    const declarations = Array.from({ length: 8 }, (_, index) => `--card-v${index}: ${index}px;`).join("");
    const wrapper = [
      'import { createHotContext as __vite__createHotContext } from "/@vite/client";',
      'import { updateStyle as __vite__updateStyle } from "/@vite/client"',
      'const __vite__css = `.card[data-astro-cid-x]{${declarations}}`',
      "__vite__updateStyle(__vite__id, __vite__css)",
      "import.meta.hot.accept()",
    ].join("\n");
    // Rebuild the wrapper with an escaped JSON string so quotes survive JS parsing as Vite's serializer emits them.
    const css = `.card[data-astro-cid-x]{${declarations}}`;
    const code = wrapper.replace(
      "`" + `.card[data-astro-cid-x]{\${declarations}}` + "`",
      JSON.stringify(css),
    );

    const [plugin, observer] = createNudgeUiPlugins() as unknown as [
      {
        configResolved?: (config: { root: string; command: "serve" | "build" }) => void;
        load?: (id: string) => string | null | Promise<string | null>;
      },
      { transform?: (code: string, id: string) => unknown },
    ];
    plugin.configResolved!({ root, command: "serve" });
    observer.transform!(
      code,
      join(root, "src/components/Card.astro?astro&type=style&index=0&lang.css"),
    );

    const virtual = await plugin.load!("\0virtual:design-tokens");
    const catalog = parseTokenCatalog<{
      cssName: string;
      origin?: string;
      context?: { selector?: string };
      declarations: Array<{ source: string }>;
    }>(virtual);
    const cardBg = catalog.find((entry) => entry.cssName === "--card-v0");
    expect(cardBg).toBeDefined();
    expect(cardBg?.origin).toBe("project");
    const declarationContext = (cardBg?.declarations[0] as unknown as {
      context?: { selector?: string };
    })?.context;
    expect(declarationContext?.selector).toContain("[data-astro-cid-x]");
    expect(cardBg?.declarations[0]?.source).toBe("src/components/Card.astro:1");
  });
});

describe("nudgeUi react alias configuration", () => {
  // A React-installed root lets the resolver find entries; the sandbox fixture is stable in-repo.
  const sandboxRoot = join(
    fileURLToPath(new URL(".", import.meta.url)),
    "../../examples/sandbox",
  );
  const serveEnv = { command: "serve" as const };
  type ConfigHook = (
    config: unknown,
    env: { command: string },
  ) => {
    optimizeDeps?: { include?: string[]; exclude?: string[]; [key: string]: unknown };
    resolve: { alias?: unknown[]; dedupe?: string[] };
  } | undefined;

  it("dedupes React for the shared external client without aliasing it", () => {
    const plugin = nudgeUi() as unknown as { config?: ConfigHook };
    const result = plugin.config?.({ root: sandboxRoot }, serveEnv);
    expect(result?.resolve.dedupe).toEqual(["react", "react-dom"]);
    expect(result?.resolve.alias).toEqual(expect.arrayContaining([
      expect.objectContaining({ find: "nudge-ui/internal/component-runtime" }),
    ]));
    expect(result?.optimizeDeps?.include).toEqual([
      "nudge-ui/internal/component-runtime",
      "nudge-ui/internal/component-sheet",
    ]);
  });

  it("merges the component runtime into host dependency optimization settings once", () => {
    const plugin = nudgeUi() as unknown as { config?: ConfigHook };
    const hostConfig = {
      root: sandboxRoot,
      optimizeDeps: {
        include: ["host-dependency"],
        exclude: ["host-excluded-dependency"],
        force: true,
      },
    };
    const pluginConfig = plugin.config?.(hostConfig, serveEnv);
    const result = mergeConfig(hostConfig, pluginConfig ?? {});

    expect(result.optimizeDeps?.include).toEqual([
      "host-dependency",
      "nudge-ui/internal/component-runtime",
      "nudge-ui/internal/component-sheet",
    ]);
    expect(result.optimizeDeps?.exclude).toEqual(["host-excluded-dependency"]);
    expect(result.optimizeDeps?.force).toBe(true);
    expect(hostConfig.optimizeDeps).toEqual({
      include: ["host-dependency"],
      exclude: ["host-excluded-dependency"],
      force: true,
    });
  });

  it("retains React aliases for the bundled landing demo", () => {
    const plugin = nudgeUi({ demo: true }) as unknown as { config?: ConfigHook };
    const result = plugin.config?.({ root: sandboxRoot }, serveEnv);
    expect(result?.resolve.alias?.length ?? 0).toBeGreaterThan(0);
    expect(result?.resolve.dedupe).toEqual(["react", "react-dom"]);
  });

  it("returns no alias configuration when skipReactAliases is set (Astro SSR)", () => {
    const plugin = nudgeUi({ skipReactAliases: true }) as unknown as {
      config?: ConfigHook;
    };
    expect(plugin.config?.({ root: sandboxRoot }, serveEnv)).toEqual({
      server: { watch: { ignored: ["**/.nudge", "**/.nudge/**"] } },
      optimizeDeps: {
        include: ["nudge-ui/internal/component-runtime", "nudge-ui/internal/component-sheet"],
      },
      resolve: {
        alias: expect.arrayContaining([
          expect.objectContaining({ find: "nudge-ui/internal/component-runtime" }),
        ]),
        dedupe: ["react", "react-dom"],
      },
    });
  });

  it("returns no alias configuration during production builds", () => {
    const plugin = nudgeUi() as unknown as { config?: ConfigHook };
    expect(
      plugin.config?.({ root: sandboxRoot }, { command: "build" }),
    ).toBeUndefined();
  });
});

describe("withNudgeUi Vite configuration wrapper", () => {
  it("appends the host Adapter without mutating an object export", () => {
    const existing = { plugins: [{ name: "react" }] };
    const wrapped = withNudgeUi(existing);

    expect(existing.plugins).toEqual([{ name: "react" }]);
    expect(wrapped).toMatchObject({
      plugins: [
        { name: "react" },
        { name: "nudge-ui" },
        { name: "nudge-ui:transformed-css" },
      ],
    });
  });

  it("resolves callback exports with the Vite command environment", () => {
    const wrapped = withNudgeUi((env) => ({
      root: env.mode === "test" ? "/tmp/test-root" : "/tmp/dev-root",
      plugins: [],
    }));

    expect(typeof wrapped).toBe("function");
    const resolved = (wrapped as (env: { command: "serve"; mode: string }) => unknown)({
      command: "serve",
      mode: "test",
    }) as { root: string; plugins: Array<{ name: string }> };
    expect(resolved.root).toBe("/tmp/test-root");
    expect(resolved.plugins.map((plugin) => plugin.name)).toEqual([
      "nudge-ui",
      "nudge-ui:transformed-css",
    ]);
  });

  it("resolves promise exports", async () => {
    const wrapped = withNudgeUi(Promise.resolve({ plugins: [] }));
    const resolved = await wrapped as { plugins: Array<{ name: string }> };
    expect(resolved.plugins.map((plugin) => plugin.name)).toEqual([
      "nudge-ui",
      "nudge-ui:transformed-css",
    ]);
  });

  it("does not add duplicate plugins when a config is already wrapped", () => {
    const existing = { plugins: [createNudgeUiPlugins()[0]!] };
    const wrapped = withNudgeUi(existing) as { plugins: unknown[] };
    expect(wrapped).toBe(existing);
    expect(wrapped.plugins).toHaveLength(1);
  });
});

describe("nudgeUi component contract catalog", () => {
  it("scans local TypeScript component contracts into a dev virtual module", async () => {
    const root = tempDir("nudge-ui-components-");
    writeFileSync(
      join(root, "Button.tsx"),
      `export function Button(props: { variant: "primary" | "secondary"; disabled?: boolean }) { return <button /> }`,
    );
    const plugin = devPlugin();
    plugin.configResolved!({ root, command: "serve" });
    plugin.buildStart!();
    expect(plugin.resolveId!("virtual:nudge-ui-components")).toBe(
      "\0virtual:nudge-ui-components",
    );
    const code = await plugin.load!("\0virtual:nudge-ui-components");
    expect(code).toContain('"componentId":"Button#Button"');
    expect(code).toContain('"options":["primary","secondary"]');
    expect(code).toContain('"control":"boolean"');
  });

  it("returns an empty component catalog for production builds", async () => {
    const plugin = devPlugin();
    plugin.configResolved!({ root: "/project", command: "build" });
    expect(await plugin.load!("\0virtual:nudge-ui-components")).toContain(
      "componentContracts = []",
    );
  });

  it("merges package-published component metadata into the dev catalog", async () => {
    const plugin = devPlugin({
      componentMetadata: [{
        componentId: "@work/design-system#Button",
        name: "Button",
        file: "@work/design-system",
        provenance: "package-manifest",
        props: [{
          name: "variant",
          control: "select",
          options: ["primary", "secondary"],
          optional: true,
        }],
      }],
    });
    expect(await plugin.load!("\0virtual:nudge-ui-components"))
      .toContain('"componentId":"@work/design-system#Button"');
  });
});

describe("nudgeUi token catalog compiler", () => {
  it("emits the empty token module in production builds (ADR-0002)", async () => {    const plugin = devPlugin();
    plugin.configResolved!({ root: "/project", command: "build" });
    const code = await plugin.load!("\0virtual:design-tokens");
    expect(code).toContain("tokenCatalog = []");
    expect(code).toContain("tokens = []");
    expect(code).toContain("tokenDiagnostics = []");
    expect(code).toContain("tokenGeneration = \"\"");
    expect(code).toContain("nudgeUiProjectId = \"\"");
  });

  it("discovers only Vite-resolved package CSS imports with package provenance", async () => {
    const parent = tempDir("nudge-ui-package-css-");
    const root = join(parent, "app");
    const packageRoot = join(parent, "node_modules", "@fixture");
    const appCss = join(root, "app.css");
    const themeCss = join(packageRoot, "theme.css");
    const foundationsCss = join(packageRoot, "foundations.css");
    mkdirSync(root, { recursive: true });
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(appCss, '@import "@fixture/theme.css"; @import "@fixture/theme.css";');
    writeFileSync(themeCss, '@import "./foundations.css"; :root { --color-content-primary: #20211f; --color-content-secondary: #6d6e69; }');
    writeFileSync(foundationsCss, ':root { --spacing-200: 8px; --border-radius-medium: 12px; }');
    writeFileSync(join(parent, "node_modules", "unrelated.css"), ':root { --unrelated: hotpink; }');

    const server = {
      pluginContainer: {
        resolveId: async (specifier: string, importer: string) => {
          if (specifier === "@fixture/theme.css") return { id: themeCss };
          if (specifier === "./foundations.css" && importer === themeCss) return { id: foundationsCss };
          return null;
        },
      },
      transformRequest: async () => null,
      moduleGraph: activeModuleGraph(appCss),
    };
    const plugin = devPlugin();
    startDevServer(plugin, root, server);
    const code = await plugin.load!("\0virtual:design-tokens");
    const catalog = parseTokenCatalog<{
      cssName: string;
      origin?: string;
      editable?: boolean;
      declarations: Array<{ source: string }>;
    }>(code);

    for (const name of ["--color-content-primary", "--color-content-secondary", "--spacing-200", "--border-radius-medium"]) {
      expect(catalog.find((definition) => definition.cssName === name)).toMatchObject({
        origin: "package",
        editable: false,
      });
    }
    expect(catalog.find((definition) => definition.cssName === "--color-content-primary")?.declarations[0]?.source)
      .toBe("@fixture/theme.css:1");
    expect(catalog.some((definition) => definition.cssName === "--unrelated")).toBe(false);
  });

  it("does not activate package CSS imported only by an unreferenced stylesheet", async () => {
    const parent = tempDir("nudge-ui-dead-package-css-");
    const root = join(parent, "app");
    const packageRoot = join(parent, "node_modules", "@fixture");
    const activeCss = join(root, "active.css");
    const deadCss = join(root, "dead.css");
    const deadPackageCss = join(packageRoot, "dead.css");
    mkdirSync(root, { recursive: true });
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(activeCss, ":root { --active: 1px; }");
    writeFileSync(deadCss, '@import "@fixture/dead.css";');
    writeFileSync(deadPackageCss, ":root { --must-stay-unreachable: hotpink; }");

    const server = {
      pluginContainer: {
        resolveId: async (specifier: string) => specifier === "@fixture/dead.css"
          ? { id: deadPackageCss }
          : null,
      },
      transformRequest: async () => null,
      moduleGraph: activeModuleGraph(activeCss),
    };
    const plugin = devPlugin();
    startDevServer(plugin, root, server);

    const code = (await plugin.load("\0virtual:design-tokens"))!;
    expect(code).toContain("--active");
    expect(code).not.toContain("--must-stay-unreachable");
  });

  it("does not claim independent active roots have authoritative cascade order", async () => {
    const root = tempDir("nudge-ui-root-order-");
    const firstCss = join(root, "first.css");
    const secondCss = join(root, "second.css");
    writeFileSync(firstCss, ":root { --first: 1px; }");
    writeFileSync(secondCss, ":root { --second: 2px; }");
    const plugin = devPlugin();
    startDevServer(plugin, root, nullServer(activeModuleGraph(firstCss, secondCss)));

    const code = (await plugin.load("\0virtual:design-tokens"))!;
    const catalog = parseTokenCatalog<{ declarations: Array<{ contribution: { orderEvidence: { kind: string } } }> }>(code);
    expect(catalog).toHaveLength(2);
    expect(catalog.every((definition) =>
      definition.declarations[0]?.contribution.orderEvidence.kind === "discovery"))
      .toBe(true);
  });

  it("retains graph ordering when the CSS transform observes the stylesheet again", async () => {
    const root = tempDir("nudge-ui-transform-order-");
    const appCss = join(root, "app.css");
    writeFileSync(appCss, ":root { --brand: #123456; }");
    type MainPlugin = {
      transform?: { handler?: (code: string, id: string) => unknown };
      configResolved(config: { root: string; command: "serve" }): void;
      configureServer(server: unknown): void;
      buildStart(): void;
      load(id: string): string | null | Promise<string | null>;
    };
    let mainPlugin: MainPlugin;
    let transformedObserver: {
      transform?: (code: string, id: string) => unknown;
    };
    const server = {
      pluginContainer: { resolveId: async () => null },
      transformRequest: async (id: string) => {
        const code = readFileSync(id, "utf8");
        mainPlugin.transform?.handler?.(code, id);
        transformedObserver.transform?.(code, id);
      },
      moduleGraph: activeModuleGraph(appCss),
    };
    const plugins = createNudgeUiPlugins() as unknown as [MainPlugin, typeof transformedObserver];
    [mainPlugin, transformedObserver] = plugins;
    startDevServer(mainPlugin, root, server);

    const code = await mainPlugin.load("\0virtual:design-tokens");
    const catalog = parseTokenCatalog<{ cssName: string; declarations: Array<{
      contribution: { orderEvidence: { kind: string; index: number } };
    }> }>(code);

    expect(catalog.find((definition) => definition.cssName === "--brand")?.declarations[0]
      ?.contribution.orderEvidence).toEqual({ kind: "stylesheet", index: 0 });
  });

  it("transforms discovered host CSS before a cold virtual token-module load", async () => {
    const root = tempDir("nudge-ui-cold-transform-");
    const appCss = join(root, "app.css");
    writeFileSync(appCss, "@theme { --color-brand: #123456; }");
    const virtual = { id: "\0virtual:design-tokens" };
    const invalidated: unknown[] = [];
    const transformed = ':root { --color-brand: #123456; --tw-brand-opacity: 1; }';
    let transformedObserver: { transform?: (code: string, id: string) => unknown };
    const server = {
      pluginContainer: { resolveId: async () => null },
      transformRequest: async (id: string) => {
        transformedObserver.transform?.(transformed, id);
      },
      moduleGraph: {
        idToModuleMap: new Map(),
        getModuleById: (id: string) => id === "\0virtual:design-tokens" ? virtual : undefined,
        invalidateModule: (module: unknown) => { invalidated.push(module); },
      },
    };
    const [plugin, observer] = createNudgeUiPlugins() as unknown as [DevPlugin, typeof transformedObserver];
    transformedObserver = observer;
    startDevServer(plugin, root, server);

    const code = await plugin.load("\0virtual:design-tokens");
    expect(code).toContain("--tw-brand-opacity");
    expect(invalidated).toContain(virtual);
  });

  it("removes package CSS when component HMR drops its stylesheet import", async () => {
    const parent = tempDir("nudge-ui-component-css-hmr-");
    const root = join(parent, "app");
    const packageRoot = join(parent, "node_modules", "@fixture");
    const component = join(root, "App.tsx");
    const entryCss = join(root, "theme-entry.css");
    const packageCss = join(packageRoot, "theme.css");
    mkdirSync(root, { recursive: true });
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(component, 'import "./theme-entry.css"; export const App = () => null;');
    writeFileSync(entryCss, '@import "@fixture/theme.css";');
    writeFileSync(packageCss, ":root { --package-active: 4px; }");

    const tokenVirtual = { id: "\0virtual:design-tokens" };
    const componentVirtual = { id: "\0virtual:nudge-ui-components" };
    const componentModule = { id: component };
    const invalidated = new Set<unknown>();
    const moduleGraph = {
      ...activeModuleGraph(entryCss),
      getModuleById: (id: string) => id === tokenVirtual.id
        ? tokenVirtual
        : id === componentVirtual.id ? componentVirtual : undefined,
      invalidateModule: (module: unknown) => { invalidated.add(module); },
    };
    const server = {
      pluginContainer: {
        resolveId: async (specifier: string) => specifier === "@fixture/theme.css"
          ? { id: packageCss }
          : null,
      },
      transformRequest: async (id: string) => {
        if (id === component && invalidated.has(componentModule)) {
          moduleGraph.idToModuleMap.clear();
        }
        return null;
      },
      moduleGraph,
    };
    const plugin = devPlugin();
    startDevServer(plugin, root, server);
    expect(await plugin.load(tokenVirtual.id)).toContain("--package-active");

    const updated = "export const App = () => null;";
    writeFileSync(component, updated);
    await plugin.handleHotUpdate({
        file: component,
        read: async () => updated,
        server,
        modules: [componentModule],
    });

    expect(await plugin.load(tokenVirtual.id)).not.toContain("--package-active");
  });

  it("ignores conventional build output when compiling the dev token catalog", async () => {
    const parent = tempDir("nudge-ui-build-output-");
    const root = join(parent, "app");
    const sourceCss = join(root, "app.css");
    const outputCss = join(root, "build", "client", "app.css");
    mkdirSync(join(root, "build", "client"), { recursive: true });
    writeFileSync(sourceCss, ":root { --color-content-primary: #20211f; }");
    writeFileSync(outputCss, ":root { --color-content-primary: #ffffff; }");

    const plugin = devPlugin();
    startDevServer(plugin, root, nullServer());
    const code = await plugin.load!("\0virtual:design-tokens");
    const catalog = parseTokenCatalog<{
      cssName: string;
      declarations: Array<{ value: string; source: string }>;
    }>(code);

    expect(catalog.find((definition) => definition.cssName === "--color-content-primary"))
      .toMatchObject({ declarations: [expect.objectContaining({ value: "#20211f", source: "app.css:1" })] });
  });

  it("falls back to Node package exports when a CSS import bypasses Vite resolution", async () => {
    const parent = tempDir("nudge-ui-package-css-exports-");
    const root = join(parent, "app");
    const packageRoot = join(parent, "node_modules", "@fixture", "design-system");
    const appCss = join(root, "app.css");
    const themeCss = join(packageRoot, "theme.css");
    mkdirSync(root, { recursive: true });
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(appCss, '@import "@fixture/design-system/theme.css";');
    writeFileSync(
      join(packageRoot, "package.json"),
      JSON.stringify({
        name: "@fixture/design-system",
        exports: { "./theme.css": "./theme.css" },
      }),
    );
    writeFileSync(themeCss, ':root { --color-content-primary: #20211f; }');

    const server = nullServer(activeModuleGraph(appCss));
    const plugin = devPlugin();
    startDevServer(plugin, root, server);
    const code = await plugin.load!("\0virtual:design-tokens");
    const catalog = parseTokenCatalog<{
      cssName: string;
      origin?: string;
    }>(code);

    expect(catalog.find((definition) => definition.cssName === "--color-content-primary"))
      .toMatchObject({ origin: "package" });
  });

  it("refreshes and removes reachable package CSS entries on HMR", async () => {
    const parent = tempDir("nudge-ui-package-css-hmr-");
    const root = join(parent, "app");
    const packageRoot = join(parent, "node_modules", "@fixture");
    const appCss = join(root, "app.css");
    const themeCss = join(packageRoot, "theme.css");
    const foundationsCss = join(packageRoot, "foundations.css");
    mkdirSync(root, { recursive: true });
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(appCss, '@import "@fixture/theme.css";');
    writeFileSync(themeCss, '@import "./foundations.css"; :root { --color-content-primary: #20211f; }');
    writeFileSync(foundationsCss, ':root { --spacing-200: 8px; }');

    const virtual = { id: "\0virtual:design-tokens" };
    const server = {
      pluginContainer: {
        resolveId: async (specifier: string, importer: string) => {
          if (specifier === "@fixture/theme.css") return { id: themeCss };
          if (specifier === "./foundations.css" && importer === themeCss) return { id: foundationsCss };
          return null;
        },
      },
      transformRequest: async () => null,
      moduleGraph: {
        ...activeModuleGraph(appCss),
        getModuleById: (id: string) => id === "\0virtual:design-tokens" ? virtual : undefined,
        invalidateModule: () => undefined,
      },
    };
    const plugin = devPlugin();
    startDevServer(plugin, root, server);
    await plugin.load!("\0virtual:design-tokens");

    writeFileSync(foundationsCss, ':root { --spacing-300: 12px; }');
    await plugin.handleHotUpdate!({
      file: foundationsCss,
      read: async () => ':root { --spacing-300: 12px; }',
      server,
      modules: [],
    });
    let code = await plugin.load!("\0virtual:design-tokens");
    expect(code).toContain("--spacing-300");
    expect(code).not.toContain("--spacing-200");

    writeFileSync(appCss, ':root { --project-color: #ffffff; }');
    await plugin.handleHotUpdate!({
      file: appCss,
      read: async () => ':root { --project-color: #ffffff; }',
      server,
      modules: [],
    });
    code = await plugin.load!("\0virtual:design-tokens");
    expect(code).toContain("--project-color");
    expect(code).not.toContain("--color-content-primary");
    expect(code).not.toContain("--spacing-300");
  });

  it("enriches active package CSS with a resolved published contract and refreshes it on HMR", async () => {
    const parent = tempDir("nudge-ui-vanilla-contract-");
    const root = join(parent, "app");
    const packageRoot = join(parent, "node_modules", "@fixture");
    const appCss = join(root, "app.css");
    const themeCss = join(packageRoot, "theme.css");
    const contractId = join(packageRoot, "contract.ts");
    mkdirSync(root, { recursive: true });
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(appCss, '@import "@fixture/theme.css";');
    writeFileSync(themeCss, ':root { --color-content-primary: #20211f; --color-content-secondary: #6d6e69; }');
    let contract: ThemeContractFixture = {
      vars: { color: { content: { primary: "var(--color-content-primary)" } } },
    };
    const virtual = { id: "\0virtual:design-tokens" };
    const server = {
      pluginContainer: {
        resolveId: async (specifier: string) => {
          if (specifier === "@fixture/theme.css") return { id: themeCss };
          if (specifier === "@fixture/contract") return { id: contractId };
          return null;
        },
      },
      ssrLoadModule: async () => contract,
      transformRequest: async () => null,
      moduleGraph: {
        ...activeModuleGraph(appCss),
        getModuleById: (id: string) => id === "\0virtual:design-tokens" ? virtual : undefined,
        invalidateModule: () => undefined,
      },
    };
    const plugin = devPlugin({
      vanillaExtract: { themeContractModule: "@fixture/contract", themeContractExport: "vars" },
    });
    startDevServer(plugin, root, server);

    let code = await plugin.load!("\0virtual:design-tokens");
    const firstGeneration = JSON.parse(/export const tokenGeneration = (.*);/.exec(code!)![1]!) as string;
    expect(code).toContain('"name":"theme.color.content.primary"');
    expect(code).toContain('"value":"#20211f"');
    expect(code).toContain('"origin":"package"');
    expect((code!.match(/--color-content-primary/g) ?? []).length).toBeGreaterThan(0);

    contract = { vars: { color: { content: { secondary: "var(--color-content-secondary)" } } } };
    await plugin.handleHotUpdate!({
      file: contractId,
      read: async () => "export const vars = {};",
      server,
      modules: [],
    });
    code = await plugin.load!("\0virtual:design-tokens");
    const secondGeneration = JSON.parse(/export const tokenGeneration = (.*);/.exec(code!)![1]!) as string;
    expect(code).toContain('"name":"theme.color.content.secondary"');
    expect(code).not.toContain('"name":"theme.color.content.primary"');
    expect(secondGeneration).not.toBe(firstGeneration);
  });

  it.each([
    ["unresolved", null, {}, "vanilla-extract-contract-unresolved"],
    ["missing export", "/fixture/contract.ts", {}, "vanilla-extract-contract-missing-export"],
    ["unsupported shape", "/fixture/contract.ts", { vars: "not-an-object" }, "vanilla-extract-contract-unsupported-shape"],
  ])("fails soft with a %s published-contract diagnostic", async (_label, resolvedId, namespace, code) => {
    const plugin = devPlugin({
      vanillaExtract: { themeContractModule: "@fixture/contract", themeContractExport: "vars" },
    });
    plugin.configResolved!({ root: "/app", command: "serve" });
    plugin.configureServer!({
      pluginContainer: { resolveId: async () => resolvedId ? { id: resolvedId } : null },
      ssrLoadModule: async () => namespace,
    });

    const virtual = await plugin.load!("\0virtual:design-tokens");
    expect(virtual).toContain(code);
    expect(virtual).toContain("tokenCatalog = []");
  });

  it("keeps CSS-derived tokens available when an optional contract export is invalid", async () => {
    const root = tempDir("nudge-ui-invalid-contract-");
    writeFileSync(join(root, "app.css"), ':root { --still-available: #123456; }');
    const plugin = devPlugin({
      vanillaExtract: { themeContractModule: "@fixture/contract", themeContractExport: "vars" },
    });
    startDevServer(plugin, root, {
      pluginContainer: { resolveId: async () => ({ id: "/fixture/contract.ts" }) },
      ssrLoadModule: async () => ({ vars: "invalid" }),
    });

    const virtual = await plugin.load!("\0virtual:design-tokens");
    expect(virtual).toContain("--still-available");
    expect(virtual).toContain("vanilla-extract-contract-unsupported-shape");
  });

  it("keeps authored Tailwind v4 theme tokens editable project tokens", async () => {
    const root = tempDir("nudge-ui-catalog-");
    writeFileSync(join(root, "app.css"), '@import "tailwindcss"; @theme { --color-brand: #123456; }');
    const plugin = devPlugin();
    plugin.configResolved!({ root, command: "serve" });
    plugin.buildStart!();
    const code = await plugin.load!("\0virtual:design-tokens");
    const catalog = parseTokenCatalog<{
      cssName: string;
      origin?: string;
      editable?: boolean;
    }>(code);

    expect(catalog.find((definition) => definition.cssName === "--color-brand")).toMatchObject({
      origin: "project",
      editable: true,
    });
  });

  it("reconciles authored and transformed observations independent of feed order", async () => {
    const build = async (transformFirst: boolean) => {
      const parent = tempDir("nudge-ui-reconcile-order-");
      const root = join(parent, "app");
      const appCss = join(root, "app.css");
      mkdirSync(root, { recursive: true });
      const authored = '@theme { --color-brand: #123456; }';
      const transformed = ':root, :host { --color-brand: #123456; --tw-brand-opacity: 1; }';
      writeFileSync(appCss, authored);
      const [plugin, transformedObserver] = createNudgeUiPlugins() as unknown as [DevPlugin, { transform?: (code: string, id: string) => unknown }];
      plugin.configResolved!({ root, command: "serve" });
      if (transformFirst) {
        transformedObserver.transform!(transformed, appCss);
        plugin.buildStart!();
      } else {
        plugin.buildStart!();
        transformedObserver.transform!(transformed, appCss);
      }
      const code = (await plugin.load!("\0virtual:design-tokens"))!;
      return parseTokenCatalog<{
        cssName: string;
        origin?: string;
        editable?: boolean;
        adapter?: string;
        declarations: Array<{ value: string; context?: { selector?: string } }>;
      }>(code);
    };

    const authoredFirst = await build(false);
    const transformFirst = await build(true);

    // Cold-start output is identical regardless of which observation lands first.
    expect(transformFirst).toEqual(authoredFirst);

    // The transformed observation supplies the browser-relevant facts; authored names keep project provenance.
    expect(authoredFirst.find((entry) => entry.cssName === "--color-brand"))
      .toMatchObject({ declarations: [expect.objectContaining({ value: "#123456", context: { selector: ":root, :host" } })] });
    expect(authoredFirst.find((entry) => entry.cssName === "--color-brand"))
      .toMatchObject({ origin: "project", editable: true, adapter: "tailwind-v4" });
    expect(authoredFirst.find((entry) => entry.cssName === "--tw-brand-opacity"))
      .toMatchObject({ origin: "framework", editable: false, adapter: "tailwind-v4" });
  });

  it("retains the authored snapshot with a recoverable diagnostic when the post-transform request fails", async () => {
    const parent = tempDir("nudge-ui-transform-failure-");
    const root = join(parent, "app");
    const appCss = join(root, "app.css");
    mkdirSync(root, { recursive: true });
    writeFileSync(appCss, ':root { --color-brand: #123456; }');
    const server = {
      pluginContainer: { resolveId: async () => null },
      transformRequest: async () => { throw new Error("transform unavailable"); },
      moduleGraph: activeModuleGraph(appCss),
    };
    const plugin = devPlugin();
    startDevServer(plugin, root, server);

    const code = await plugin.load!("\0virtual:design-tokens");
    const catalog = parseTokenCatalog<{
      cssName: string;
      origin?: string;
      declarations: Array<{ value: string }>;
    }>(code);

    // The authored observation stays the browser-relevant facts; the failed transform surfaces as a diagnostic.
    expect(catalog.find((definition) => definition.cssName === "--color-brand"))
      .toMatchObject({ origin: "project", declarations: [expect.objectContaining({ value: "#123456" })] });
    expect(code).toContain("transform-observation-failed");
  });

  it("records a failed-transform diagnostic on HMR and clears it on recovery", async () => {
    const parent = tempDir("nudge-ui-transform-hmr-recovery-");
    const root = join(parent, "app");
    const appCss = join(root, "app.css");
    mkdirSync(root, { recursive: true });
    writeFileSync(appCss, ':root { --color-brand: #123456; }');
    let transformFails = true;
    const virtual = { id: "\0virtual:design-tokens" };
    const server = {
      pluginContainer: { resolveId: async () => null },
      transformRequest: async () => {
        if (transformFails) throw new Error("transform unavailable");
        return null;
      },
      moduleGraph: {
        ...activeModuleGraph(appCss),
        getModuleById: (id: string) => id === "\0virtual:design-tokens" ? virtual : undefined,
        invalidateModule: () => undefined,
      },
    };
    const [plugin, transformedObserver] = createNudgeUiPlugins() as unknown as [DevPlugin, { transform?: (code: string, id: string) => unknown }];
    startDevServer(plugin, root, server);

    // HMR for an edited file whose post-transform request fails: authored facts stay with a recoverable diagnostic.
    writeFileSync(appCss, ':root { --color-brand: #abcdef; }');
    await plugin.handleHotUpdate!({
      file: appCss,
      read: async () => ':root { --color-brand: #abcdef; }',
      server,
      modules: [],
    });
    let code = await plugin.load!("\0virtual:design-tokens");
    expect(code).toContain("transform-observation-failed");
    expect(code).toContain("#abcdef");

    // Recovery feeds the transformed observation, clearing the diagnostic while authored facts stay the facts.
    transformFails = false;
    await plugin.handleHotUpdate!({
      file: appCss,
      read: async () => ':root { --color-brand: #abcdef; }',
      server,
      modules: [],
    });
    transformedObserver.transform!(':root { --color-brand: #abcdef; }', appCss);
    code = await plugin.load!("\0virtual:design-tokens");
    expect(code).not.toContain("transform-observation-failed");
    expect(code).toContain("#abcdef");
  });

  it("treats an unreadable HMR file as a removal, not a failed transform", async () => {
    const parent = tempDir("nudge-ui-transform-removal-");
    const root = join(parent, "app");
    const appCss = join(root, "app.css");
    mkdirSync(root, { recursive: true });
    writeFileSync(appCss, ':root { --color-brand: #123456; }');
    const virtual = { id: "\0virtual:design-tokens" };
    const server = {
      pluginContainer: { resolveId: async () => null },
      transformRequest: async () => { throw new Error("gone"); },
      moduleGraph: {
        getModuleById: (id: string) => id === "\0virtual:design-tokens" ? virtual : undefined,
        invalidateModule: () => undefined,
      },
    };
    const plugin = devPlugin();
    startDevServer(plugin, root, server);
    expect(await plugin.load!("\0virtual:design-tokens")).toContain("--color-brand");

    // Deletion removes rows and must NOT record a transform-observation-failed diagnostic.
    rmSync(appCss);
    await plugin.handleHotUpdate!({
      file: appCss,
      read: async () => { throw new Error("ENOENT"); },
      server,
      modules: [],
    });
    const code = await plugin.load!("\0virtual:design-tokens");
    expect(code).not.toContain("--color-brand");
    expect(code).not.toContain("transform-observation-failed");
  });

  it("publishes the inventory snapshot verbatim, with styling contributions merged inside it", async () => {
    const parent = tempDir("nudge-ui-snapshot-verbatim-");
    const root = join(parent, "app");
    const appCss = join(root, "app.css");
    const packageRoot = join(parent, "node_modules", "@fixture");
    const themeCss = join(packageRoot, "theme.css");
    const contractId = join(packageRoot, "contract.ts");
    const appContent = '@import "@fixture/theme.css"; @theme { --color-brand: #123456; }';
    const themeContent = ':root { --color-content-primary: #20211f; }';
    const contract = { vars: { color: { content: { primary: "var(--color-content-primary)" } } } };
    mkdirSync(root, { recursive: true });
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(appCss, appContent);
    writeFileSync(themeCss, themeContent);
    const server = {
      pluginContainer: {
        resolveId: async (specifier: string) => {
          if (specifier === "@fixture/theme.css") return { id: themeCss };
          if (specifier === "@fixture/contract") return { id: contractId };
          return null;
        },
      },
      ssrLoadModule: async () => contract,
      transformRequest: async () => null,
      moduleGraph: activeModuleGraph(appCss),
    };
    const plugin = devPlugin({
      vanillaExtract: { themeContractModule: "@fixture/contract", themeContractExport: "vars" },
    });
    startDevServer(plugin, root, server);

    const code = (await plugin.load!("\0virtual:design-tokens"))!;
    const published = {
      catalog: JSON.parse(code.match(/^export const tokenCatalog = (.*);$/m)?.[1] ?? "[]"),
      tokens: JSON.parse(code.match(/^export const tokens = (.*);$/m)?.[1] ?? "[]"),
      generation: JSON.parse(code.match(/^export const tokenGeneration = (.*);$/m)?.[1] ?? '""'),
    };

    // Rebuild the inventory from the same facts; any post-processing in load() would diverge from this engine output.
    const expected = createTokenInventory();
    expected.apply({
      buildTool: "vite",
      id: "app.css",
      stage: "authored",
      provenance: "project",
      order: 1,
      adapter: "tailwind-v4",
      content: appContent,
    });
    expected.apply({
      buildTool: "vite",
      id: "@fixture/theme.css",
      stage: "authored",
      provenance: "package",
      order: 0,
      content: themeContent,
    });
    // The same evidence the plugin gathered, interpreted the same way.
    for (const contribution of interpretDialects({
      tailwindV4Css: true,
      publishedThemeContract: {
        attempted: true,
        contract: contract.vars,
        fromPackage: true,
        source: "@fixture/contract",
      },
    }).contributions) expected.applyContribution(contribution);
    const snapshot = expected.snapshot();

    expect(published.catalog).toEqual(snapshot.definitions);
    expect(published.tokens).toEqual(snapshot.tokens);
    expect(published.generation).toBe(snapshot.generation);
    // The merged labels live inside the snapshot, not a post-snapshot pass.
    const catalog = published.catalog as Array<{ cssName: string; name: string; adapter?: string; origin?: string; editable?: boolean }>;
    expect(catalog.find((entry) => entry.cssName === "--color-brand"))
      .toMatchObject({ adapter: "tailwind-v4", origin: "project", editable: true });
    expect(catalog.find((entry) => entry.cssName === "--color-content-primary"))
      .toMatchObject({ name: "theme.color.content.primary", adapter: "vanilla-extract", origin: "package", editable: false });
  });

  it("bumps the published generation exactly once per observable HMR change and treats an identical follow-up as a no-op", async () => {
    const parent = tempDir("nudge-ui-hmr-once-");
    const root = join(parent, "app");
    const appCss = join(root, "app.css");
    mkdirSync(root, { recursive: true });
    writeFileSync(appCss, ':root { --color-brand: #123456; }');
    const invalidations: string[] = [];
    const virtual = { id: "\0virtual:design-tokens" };
    const server = {
      pluginContainer: { resolveId: async () => null },
      transformRequest: async () => null,
      moduleGraph: {
        getModuleById: (id: string) => id === "\0virtual:design-tokens" ? virtual : undefined,
        invalidateModule: (m: { id: string }) => { invalidations.push(m.id); },
      },
    };
    const plugin = devPlugin();
    startDevServer(plugin, root, server);

    const generation = async () => {
      const code = (await plugin.load!("\0virtual:design-tokens"))!;
      return JSON.parse(code.match(/^export const tokenGeneration = (.*);$/m)?.[1] ?? '""') as string;
    };

    const first = await generation();
    expect(first).toMatch(/^g[0-9a-f]+$/);

    // One observable change feeds authored + graph facts but must invalidate and bump exactly once.
    writeFileSync(appCss, ':root { --color-brand: #abcdef; --extra-token: 4px; }');
    await plugin.handleHotUpdate!({
      file: appCss,
      read: async () => ':root { --color-brand: #abcdef; --extra-token: 4px; }',
      server,
      modules: [],
    });
    expect(invalidations).toHaveLength(1);
    const changed = await generation();
    expect(changed).not.toBe(first);

    // An identical follow-up HMR is a no-op: no invalidation, no bump.
    await plugin.handleHotUpdate!({
      file: appCss,
      read: async () => ':root { --color-brand: #abcdef; --extra-token: 4px; }',
      server,
      modules: [],
    });
    expect(invalidations).toHaveLength(1);
    expect(await generation()).toBe(changed);

    writeFileSync(appCss, ':root { --color-brand: #ffffff; }');
    await plugin.handleHotUpdate!({
      file: appCss,
      read: async () => ':root { --color-brand: #ffffff; }',
      server,
      modules: [],
    });
    expect(invalidations).toHaveLength(2);
    const bumped = await generation();
    expect(bumped).not.toBe(changed);
    expect(bumped).not.toBe(first);
  });

  it("reloads an external-client page when token or component knowledge changes", async () => {
    const root = tempDir("nudge-ui-external-client-hmr-");
    const cssFile = join(root, "app.css");
    const componentFile = join(root, "App.tsx");
    writeFileSync(cssFile, ":root { --tone: red; }");
    writeFileSync(componentFile, [
      'export interface AppProps { tone?: "quiet" | "loud"; }',
      'export function App({ tone = "quiet" }: AppProps) { return <button>{tone}</button>; }',
    ].join("\n"));
    const reloads: string[] = [];
    const server = {
      pluginContainer: { resolveId: async () => null },
      transformRequest: async () => null,
      ws: { send: (message: { type: string }) => reloads.push(message.type) },
      moduleGraph: {
        idToModuleMap: new Map(),
        getModuleById: () => undefined,
        invalidateModule: () => undefined,
      },
    };
    const plugin = devPlugin();
    startDevServer(plugin, root, server);

    writeFileSync(cssFile, ":root { --tone: blue; }");
    await plugin.handleHotUpdate({
      file: cssFile,
      read: async () => ":root { --tone: blue; }",
      server,
      modules: [],
      timestamp: 1,
    });
    expect(reloads).toEqual(["full-reload"]);

    await plugin.handleHotUpdate({
      file: componentFile,
      read: async () => [
        'export interface AppProps { tone?: "quiet" | "loud"; size?: "small" | "large"; }',
        'export function App({ tone = "quiet", size = "small" }: AppProps) { return <button>{tone} {size}</button>; }',
      ].join("\n"),
      server,
      modules: [],
      timestamp: 2,
    });

    expect(reloads).toEqual(["full-reload", "full-reload"]);
  });

  it("publishes real watcher add and unlink events exactly once", async () => {
    const root = tempDir("nudge-ui-watch-hmr-");
    const addedCss = join(root, "added.css");
    const callbacks: Partial<Record<"add" | "unlink", (file: string) => Promise<void>>> = {};
    const watcher = {
      on(event: "add" | "unlink", listener: (file: string) => Promise<void>) {
        callbacks[event] = listener;
        return watcher;
      },
    };
    const invalidations: string[] = [];
    const reloads: string[] = [];
    const virtual = { id: "\0virtual:design-tokens" };
    const server = {
      pluginContainer: { resolveId: async () => null },
      transformRequest: async () => null,
      watcher,
      ws: { send: (message: { type: string }) => { reloads.push(message.type); } },
      moduleGraph: {
        getModuleById: (id: string) => id === virtual.id ? virtual : undefined,
        invalidateModule: (module: { id: string }) => { invalidations.push(module.id); },
        onFileDelete: () => undefined,
      },
    };
    const plugin = devPlugin();
    startDevServer(plugin, root, server);
    const initial = (await plugin.load(virtual.id))!;
    const initialGeneration = JSON.parse(
      initial.match(/^export const tokenGeneration = (.*);$/m)?.[1] ?? '""',
    ) as string;

    writeFileSync(addedCss, ":root { --added-token: 8px; }");
    await callbacks.add!(addedCss);
    const added = (await plugin.load(virtual.id))!;
    const addedGeneration = JSON.parse(
      added.match(/^export const tokenGeneration = (.*);$/m)?.[1] ?? '""',
    ) as string;
    expect(added).toContain("--added-token");
    expect(addedGeneration).not.toBe(initialGeneration);
    expect(invalidations).toEqual([virtual.id]);
    expect(reloads).toEqual(["full-reload"]);

    rmSync(addedCss);
    await callbacks.unlink!(addedCss);
    const removed = (await plugin.load(virtual.id))!;
    const removedGeneration = JSON.parse(
      removed.match(/^export const tokenGeneration = (.*);$/m)?.[1] ?? '""',
    ) as string;
    expect(removed).not.toContain("--added-token");
    expect(removedGeneration).not.toBe(addedGeneration);
    expect(invalidations).toEqual([virtual.id, virtual.id]);
    expect(reloads).toEqual(["full-reload", "full-reload"]);
  });

  it("bumps the published generation exactly once for a theme-contract HMR change and ignores an identical refresh", async () => {
    const parent = tempDir("nudge-ui-contract-hmr-once-");
    const root = join(parent, "app");
    const contractId = join(root, "contract.ts");
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "app.css"), ':root { --color-content-primary: #20211f; --color-content-secondary: #6d6e69; }');
    let contract: ThemeContractFixture = {
      vars: { color: { content: { primary: "var(--color-content-primary)" } } },
    };
    let cachedContract = contract;
    const invalidations: string[] = [];
    const virtual = { id: "\0virtual:design-tokens" };
    const contractModule = { id: contractId };
    const server = {
      pluginContainer: {
        resolveId: async (specifier: string) => {
          if (specifier === "@fixture/contract") return { id: contractId };
          return null;
        },
      },
      ssrLoadModule: async () => cachedContract,
      transformRequest: async () => null,
      moduleGraph: {
        getModuleById: (id: string) => id === "\0virtual:design-tokens" ? virtual : undefined,
        invalidateModule: (module: { id: string }) => {
          if (module === contractModule) cachedContract = contract;
          else invalidations.push(module.id);
        },
      },
    };
    const plugin = devPlugin({
      vanillaExtract: { themeContractModule: "@fixture/contract", themeContractExport: "vars" },
    });
    startDevServer(plugin, root, server);

    const generation = async () => {
      const code = (await plugin.load!("\0virtual:design-tokens"))!;
      return JSON.parse(code.match(/^export const tokenGeneration = (.*);$/m)?.[1] ?? '""') as string;
    };

    const first = await generation();
    expect(codeContainsName(await plugin.load!("\0virtual:design-tokens"), "theme.color.content.primary")).toBe(true);

    // Contract refresh with genuinely different facts bumps exactly once.
    contract = { vars: { color: { content: { secondary: "var(--color-content-secondary)" } } } };
    await plugin.handleHotUpdate!({
      file: contractId,
      read: async () => "export const vars = {};",
      server,
      modules: [contractModule],
    });
    expect(invalidations).toHaveLength(1);
    const changed = await generation();
    expect(changed).not.toBe(first);
    const changedCode = (await plugin.load!("\0virtual:design-tokens"))!;
    expect(codeContainsName(changedCode, "theme.color.content.secondary")).toBe(true);
    expect(codeContainsName(changedCode, "theme.color.content.primary")).toBe(false);

    // An identical contract reload is a no-op.
    await plugin.handleHotUpdate!({
      file: contractId,
      read: async () => "export const vars = {};",
      server,
      modules: [contractModule],
    });
    expect(invalidations).toHaveLength(1);
    expect(await generation()).toBe(changed);
  });
});
