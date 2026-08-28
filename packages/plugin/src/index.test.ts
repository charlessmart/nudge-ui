import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createTokenInventory } from "@nudge-ui/css/token-inventory";
import {
  nudgeUi as createNudgeUiPlugins,
  extractViteModuleCss,
  isHostApplicationSource,
  transformIndexHtmlHtml,
} from "./index.ts";
import { createTailwindV4NamingContribution } from "./adapters/tailwindV4.ts";
import { materializeVanillaExtractContribution } from "./adapters/vanillaExtractContract.ts";

const nudgeUi = (...args: Parameters<typeof createNudgeUiPlugins>) =>
  createNudgeUiPlugins(...args)[0]!;

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

describe("transformIndexHtmlHtml", () => {
  it("injects the mount div + script before </body> in serve mode", () => {
    const out = transformIndexHtmlHtml(SAMPLE_HTML, "serve");
    expect(out).not.toBeNull();
    expect(out!).toContain('<div id="nudge-ui-root"></div>');
    expect(out!).toContain(
      '<script type="module" src="/@id/__x00__virtual:nudge-ui-inspector"></script>',
    );
    expect(out!.indexOf("<body>")).toBeLessThan(out!.indexOf('id="nudge-ui-root"'));
    expect(out!.indexOf('id="nudge-ui-root"')).toBeLessThan(out!.lastIndexOf("</body>"));
  });

  it("returns null in build mode (ADR-0002)", () => {
    expect(transformIndexHtmlHtml(SAMPLE_HTML, "build")).toBeNull();
  });

  it("appends the injection when </body> is absent", () => {
    const html = `<html><head></head><body><div id="root"></div></body>`;
    // still contains </body> here; try one without
    const noBody = `<div>no body</div>`;
    const out = transformIndexHtmlHtml(noBody, "serve");
    expect(out).not.toBeNull();
    expect(out!).toContain('<div id="nudge-ui-root"></div>');
    expect(out!.endsWith("<div id=\"nudge-ui-root\"></div>\n<script type=\"module\" src=\"/@id/__x00__virtual:nudge-ui-inspector\"></script>\n")).toBe(true);
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
    const plugin = nudgeUi() as unknown as {
      resolveId?: (id: string) => string | null;
      load?: (id: string) => string | null | Promise<string | null>;
    };
    expect(plugin.resolveId!("virtual:nudge-ui-inspector")).toBe(
      "\0virtual:nudge-ui-inspector",
    );
    expect(plugin.resolveId!("\0virtual:nudge-ui-inspector")).toBe(
      "\0virtual:nudge-ui-inspector",
    );
  });

  it("load emits a bootstrap that calls bootstrapNudgeUi (default command is serve)", async () => {
    const plugin = nudgeUi() as unknown as {
      load?: (id: string) => string | null | Promise<string | null>;
    };
    const code = await plugin.load!("\0virtual:nudge-ui-inspector");
    expect(code).not.toBeNull();
    expect(code!).toContain('from "@nudge-ui/inspector"');
    expect(code!).toContain("bootstrapNudgeUi");
    expect(code!).toContain('getElementById("nudge-ui-root")');
  });

  it("configures the inspector from live Vite virtual modules before mounting", async () => {
    const plugin = nudgeUi() as unknown as {
      load?: (id: string) => string | null | Promise<string | null>;
    };
    const code = await plugin.load!("\0virtual:nudge-ui-inspector");
    expect(code).toContain("configureNudgeUiRuntime({");
    expect(code).toContain('from "virtual:design-tokens"');
    expect(code).toContain('from "virtual:nudge-ui-components"');
    expect(code).toContain('host: "vite-react"');
    expect(code).toContain('framework: "React"');
    expect(code).toContain("capabilities: { canvas: true, componentSemantics: true }");
    expect(code).toContain("stylingSystem: detectFramework(tokens).stylingSystem");
    expect(code).toContain("projectId: nudgeUiProjectId");
    expect(code).toContain("tokenCatalog,");
    expect(code).toContain("tokens,");
    expect(code).toContain("tokenDiagnostics,");
    expect(code).toContain("tokenGeneration,");
    expect(code).toContain("componentContracts,");
    expect(code!.indexOf("configureNudgeUiRuntime({")).toBeLessThan(
      code!.indexOf("bootstrapNudgeUi(__dt_root)"),
    );
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
    const root = mkdtempSync(join(tmpdir(), "nudge-ui-astro-css-"));
    try {
      const declarations = Array.from({ length: 8 }, (_, index) => `--card-v${index}: ${index}px;`).join("");
      const wrapper = [
        'import { createHotContext as __vite__createHotContext } from "/@vite/client";',
        'import { updateStyle as __vite__updateStyle } from "/@vite/client"',
        'const __vite__css = `.card[data-astro-cid-x]{${declarations}}`',
        "__vite__updateStyle(__vite__id, __vite__css)",
        "import.meta.hot.accept()",
      ].join("\n");
      // Build the real wrapper with an escaped JSON string so quotes inside
      // the CSS survive JS parsing exactly like Vite's serializer emits them.
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
      const catalog = JSON.parse(virtual!.match(/^export const tokenCatalog = (.*);$/m)?.[1] ?? "[]") as Array<{
        cssName: string;
        origin?: string;
        context?: { selector?: string };
        declarations: Array<{ source: string }>;
      }>;
      const cardBg = catalog.find((entry) => entry.cssName === "--card-v0");
      expect(cardBg).toBeDefined();
      expect(cardBg?.origin).toBe("project");
      const declarationContext = (cardBg?.declarations[0] as unknown as {
        context?: { selector?: string };
      })?.context;
      expect(declarationContext?.selector).toContain("[data-astro-cid-x]");
      expect(cardBg?.declarations[0]?.source).toBe("src/components/Card.astro:1");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("nudgeUi react alias configuration", () => {  // A root with React installed is required for the resolver to find entries;
  // the sandbox fixture is a stable in-repo candidate.
  const sandboxRoot = join(
    fileURLToPath(new URL(".", import.meta.url)),
    "../../examples/sandbox",
  );
  const serveEnv = { command: "serve" as const };
  type ConfigHook = (
    config: unknown,
    env: { command: string },
  ) => { resolve: { alias: unknown[] } } | undefined;

  it("aliases React to one instance by default in dev", () => {
    const plugin = nudgeUi() as unknown as { config?: ConfigHook };
    const result = plugin.config?.({ root: sandboxRoot }, serveEnv);
    expect(result?.resolve.alias.length ?? 0).toBeGreaterThan(0);
  });

  it("returns no alias configuration when skipReactAliases is set (Astro SSR)", () => {
    const plugin = nudgeUi({ skipReactAliases: true }) as unknown as {
      config?: ConfigHook;
    };
    expect(plugin.config?.({ root: sandboxRoot }, serveEnv)).toBeUndefined();
  });

  it("returns no alias configuration during production builds", () => {
    const plugin = nudgeUi() as unknown as { config?: ConfigHook };
    expect(
      plugin.config?.({ root: sandboxRoot }, { command: "build" }),
    ).toBeUndefined();
  });
});

describe("nudgeUi component contract catalog", () => {
  it("scans local TypeScript component contracts into a dev virtual module", async () => {
    const root = mkdtempSync(join(tmpdir(), "nudge-ui-components-"));
    try {
      writeFileSync(
        join(root, "Button.tsx"),
        `export function Button(props: { variant: "primary" | "secondary"; disabled?: boolean }) { return <button /> }`,
      );
      const plugin = nudgeUi() as unknown as {
        configResolved?: (config: { root: string; command: "serve" | "build" }) => void;
        buildStart?: () => void;
        resolveId?: (id: string) => string | null;
        load?: (id: string) => string | null | Promise<string | null>;
      };
      plugin.configResolved!({ root, command: "serve" });
      plugin.buildStart!();
      expect(plugin.resolveId!("virtual:nudge-ui-components")).toBe(
        "\0virtual:nudge-ui-components",
      );
      const code = await plugin.load!("\0virtual:nudge-ui-components");
      expect(code).toContain('"componentId":"Button#Button"');
      expect(code).toContain('"options":["primary","secondary"]');
      expect(code).toContain('"control":"boolean"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns an empty component catalog for production builds", async () => {
    const plugin = nudgeUi() as unknown as {
      configResolved?: (config: { root: string; command: "serve" | "build" }) => void;
      load?: (id: string) => string | null | Promise<string | null>;
    };
    plugin.configResolved!({ root: "/project", command: "build" });
    expect(await plugin.load!("\0virtual:nudge-ui-components")).toContain(
      "componentContracts = []",
    );
  });

  it("merges package-published component metadata into the dev catalog", async () => {
    const plugin = nudgeUi({
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
    }) as unknown as {
      load?: (id: string) => string | null | Promise<string | null>;
    };
    expect(await plugin.load!("\0virtual:nudge-ui-components"))
      .toContain('"componentId":"@work/design-system#Button"');
  });
});

describe("nudgeUi token catalog compiler", () => {
  it("emits the empty token module in production builds (ADR-0002)", async () => {    const plugin = nudgeUi() as unknown as {
      configResolved?: (config: { root: string; command: "serve" | "build" }) => void;
      load?: (id: string) => string | null | Promise<string | null>;
    };
    plugin.configResolved!({ root: "/project", command: "build" });
    const code = await plugin.load!("\0virtual:design-tokens");
    expect(code).toContain("tokenCatalog = []");
    expect(code).toContain("tokens = []");
    expect(code).toContain("tokenDiagnostics = []");
    expect(code).toContain("tokenGeneration = \"\"");
    expect(code).toContain("nudgeUiProjectId = \"\"");
  });

  it("discovers only Vite-resolved package CSS imports with package provenance", async () => {
    const parent = mkdtempSync(join(tmpdir(), "nudge-ui-package-css-"));
    const root = join(parent, "app");
    const packageRoot = join(parent, "node_modules", "@fixture");
    const appCss = join(root, "app.css");
    const themeCss = join(packageRoot, "theme.css");
    const foundationsCss = join(packageRoot, "foundations.css");
    try {
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
      const plugin = nudgeUi() as unknown as {
        configResolved?: (config: { root: string; command: "serve" | "build" }) => void;
        configureServer?: (server: unknown) => void;
        buildStart?: () => void;
        load?: (id: string) => string | null | Promise<string | null>;
      };
      plugin.configResolved!({ root, command: "serve" });
      plugin.configureServer!(server);
      plugin.buildStart!();
      const code = await plugin.load!("\0virtual:design-tokens");
      const catalog = JSON.parse(code!.match(/^export const tokenCatalog = (.*);$/m)?.[1] ?? "[]") as Array<{
        cssName: string;
        origin?: string;
        editable?: boolean;
        declarations: Array<{ source: string }>;
      }>;

      for (const name of ["--color-content-primary", "--color-content-secondary", "--spacing-200", "--border-radius-medium"]) {
        expect(catalog.find((definition) => definition.cssName === name)).toMatchObject({
          origin: "package",
          editable: false,
        });
      }
      expect(catalog.find((definition) => definition.cssName === "--color-content-primary")?.declarations[0]?.source)
        .toBe("@fixture/theme.css:1");
      expect(catalog.some((definition) => definition.cssName === "--unrelated")).toBe(false);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("does not activate package CSS imported only by an unreferenced stylesheet", async () => {
    const parent = mkdtempSync(join(tmpdir(), "nudge-ui-dead-package-css-"));
    const root = join(parent, "app");
    const packageRoot = join(parent, "node_modules", "@fixture");
    const activeCss = join(root, "active.css");
    const deadCss = join(root, "dead.css");
    const deadPackageCss = join(packageRoot, "dead.css");
    try {
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
      const plugin = nudgeUi() as unknown as {
        configResolved(config: { root: string; command: "serve" }): void;
        configureServer(server: unknown): void;
        buildStart(): void;
        load(id: string): string | null | Promise<string | null>;
      };
      plugin.configResolved({ root, command: "serve" });
      plugin.configureServer(server);
      plugin.buildStart();

      const code = (await plugin.load("\0virtual:design-tokens"))!;
      expect(code).toContain("--active");
      expect(code).not.toContain("--must-stay-unreachable");
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("does not claim independent active roots have authoritative cascade order", async () => {
    const root = mkdtempSync(join(tmpdir(), "nudge-ui-root-order-"));
    const firstCss = join(root, "first.css");
    const secondCss = join(root, "second.css");
    try {
      writeFileSync(firstCss, ":root { --first: 1px; }");
      writeFileSync(secondCss, ":root { --second: 2px; }");
      const plugin = nudgeUi() as unknown as {
        configResolved(config: { root: string; command: "serve" }): void;
        configureServer(server: unknown): void;
        buildStart(): void;
        load(id: string): string | null | Promise<string | null>;
      };
      plugin.configResolved({ root, command: "serve" });
      plugin.configureServer({
        pluginContainer: { resolveId: async () => null },
        transformRequest: async () => null,
        moduleGraph: activeModuleGraph(firstCss, secondCss),
      });
      plugin.buildStart();

      const code = (await plugin.load("\0virtual:design-tokens"))!;
      const catalog = JSON.parse(
        code.match(/^export const tokenCatalog = (.*);$/m)?.[1] ?? "[]",
      ) as Array<{ declarations: Array<{ contribution: { orderEvidence: { kind: string } } }> }>;
      expect(catalog).toHaveLength(2);
      expect(catalog.every((definition) =>
        definition.declarations[0]?.contribution.orderEvidence.kind === "discovery"))
        .toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("retains graph ordering when the CSS transform observes the stylesheet again", async () => {
    const root = mkdtempSync(join(tmpdir(), "nudge-ui-transform-order-"));
    const appCss = join(root, "app.css");
    try {
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
      mainPlugin.configResolved({ root, command: "serve" });
      mainPlugin.configureServer(server);
      mainPlugin.buildStart();

      const code = await mainPlugin.load("\0virtual:design-tokens");
      const catalog = JSON.parse(
        code!.match(/^export const tokenCatalog = (.*);$/m)?.[1] ?? "[]",
      ) as Array<{ cssName: string; declarations: Array<{
        contribution: { orderEvidence: { kind: string; index: number } };
      }> }>;

      expect(catalog.find((definition) => definition.cssName === "--brand")?.declarations[0]
        ?.contribution.orderEvidence).toEqual({ kind: "stylesheet", index: 0 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("transforms discovered host CSS before a cold virtual token-module load", async () => {
    const root = mkdtempSync(join(tmpdir(), "nudge-ui-cold-transform-"));
    const appCss = join(root, "app.css");
    try {
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
      const [plugin, observer] = createNudgeUiPlugins() as unknown as [{
        configResolved(config: { root: string; command: "serve" }): void;
        configureServer(server: unknown): void;
        buildStart(): void;
        load(id: string): string | null | Promise<string | null>;
      }, typeof transformedObserver];
      transformedObserver = observer;
      plugin.configResolved({ root, command: "serve" });
      plugin.configureServer(server);
      plugin.buildStart();

      const code = await plugin.load("\0virtual:design-tokens");
      expect(code).toContain("--tw-brand-opacity");
      expect(invalidated).toContain(virtual);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("removes package CSS when component HMR drops its stylesheet import", async () => {
    const parent = mkdtempSync(join(tmpdir(), "nudge-ui-component-css-hmr-"));
    const root = join(parent, "app");
    const packageRoot = join(parent, "node_modules", "@fixture");
    const component = join(root, "App.tsx");
    const entryCss = join(root, "theme-entry.css");
    const packageCss = join(packageRoot, "theme.css");
    try {
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
      const plugin = nudgeUi() as unknown as {
        configResolved(config: { root: string; command: "serve" }): void;
        configureServer(server: unknown): void;
        buildStart(): void;
        load(id: string): string | null | Promise<string | null>;
        handleHotUpdate(context: {
          file: string;
          read(): Promise<string>;
          server: unknown;
          modules: unknown[];
        }): Promise<unknown>;
      };
      plugin.configResolved({ root, command: "serve" });
      plugin.configureServer(server);
      plugin.buildStart();
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
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("ignores conventional build output when compiling the dev token catalog", async () => {
    const parent = mkdtempSync(join(tmpdir(), "nudge-ui-build-output-"));
    const root = join(parent, "app");
    const sourceCss = join(root, "app.css");
    const outputCss = join(root, "build", "client", "app.css");
    try {
      mkdirSync(join(root, "build", "client"), { recursive: true });
      writeFileSync(sourceCss, ":root { --color-content-primary: #20211f; }");
      writeFileSync(outputCss, ":root { --color-content-primary: #ffffff; }");

      const plugin = nudgeUi() as unknown as {
        configResolved?: (config: { root: string; command: "serve" | "build"; build?: { outDir?: string } }) => void;
        configureServer?: (server: unknown) => void;
        buildStart?: () => void;
        load?: (id: string) => string | null | Promise<string | null>;
      };
      plugin.configResolved!({ root, command: "serve" });
      plugin.configureServer!({
        pluginContainer: { resolveId: async () => null },
        transformRequest: async () => null,
      });
      plugin.buildStart!();
      const code = await plugin.load!("\0virtual:design-tokens");
      const catalog = JSON.parse(code!.match(/^export const tokenCatalog = (.*);$/m)?.[1] ?? "[]") as Array<{
        cssName: string;
        declarations: Array<{ value: string; source: string }>;
      }>;

      expect(catalog.find((definition) => definition.cssName === "--color-content-primary"))
        .toMatchObject({ declarations: [expect.objectContaining({ value: "#20211f", source: "app.css:1" })] });
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("falls back to Node package exports when a CSS import bypasses Vite resolution", async () => {
    const parent = mkdtempSync(join(tmpdir(), "nudge-ui-package-css-exports-"));
    const root = join(parent, "app");
    const packageRoot = join(parent, "node_modules", "@fixture", "design-system");
    const appCss = join(root, "app.css");
    const themeCss = join(packageRoot, "theme.css");
    try {
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

      const server = {
        pluginContainer: {
          resolveId: async () => null,
        },
        transformRequest: async () => null,
        moduleGraph: activeModuleGraph(appCss),
      };
      const plugin = nudgeUi() as unknown as {
        configResolved?: (config: { root: string; command: "serve" | "build" }) => void;
        configureServer?: (server: unknown) => void;
        buildStart?: () => void;
        load?: (id: string) => string | null | Promise<string | null>;
      };
      plugin.configResolved!({ root, command: "serve" });
      plugin.configureServer!(server);
      plugin.buildStart!();
      const code = await plugin.load!("\0virtual:design-tokens");
      const catalog = JSON.parse(code!.match(/^export const tokenCatalog = (.*);$/m)?.[1] ?? "[]") as Array<{
        cssName: string;
        origin?: string;
      }>;

      expect(catalog.find((definition) => definition.cssName === "--color-content-primary"))
        .toMatchObject({ origin: "package" });
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("refreshes and removes reachable package CSS entries on HMR", async () => {
    const parent = mkdtempSync(join(tmpdir(), "nudge-ui-package-css-hmr-"));
    const root = join(parent, "app");
    const packageRoot = join(parent, "node_modules", "@fixture");
    const appCss = join(root, "app.css");
    const themeCss = join(packageRoot, "theme.css");
    const foundationsCss = join(packageRoot, "foundations.css");
    try {
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
      const plugin = nudgeUi() as unknown as {
        configResolved?: (config: { root: string; command: "serve" | "build" }) => void;
        configureServer?: (server: unknown) => void;
        buildStart?: () => void;
        load?: (id: string) => string | null | Promise<string | null>;
        handleHotUpdate?: (context: { file: string; read(): Promise<string>; server: unknown; modules: unknown[] }) => Promise<unknown>;
      };
      plugin.configResolved!({ root, command: "serve" });
      plugin.configureServer!(server);
      plugin.buildStart!();
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
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("enriches active package CSS with a resolved published contract and refreshes it on HMR", async () => {
    const parent = mkdtempSync(join(tmpdir(), "nudge-ui-vanilla-contract-"));
    const root = join(parent, "app");
    const packageRoot = join(parent, "node_modules", "@fixture");
    const appCss = join(root, "app.css");
    const themeCss = join(packageRoot, "theme.css");
    const contractId = join(packageRoot, "contract.ts");
    try {
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
      const plugin = nudgeUi({
        vanillaExtract: { themeContractModule: "@fixture/contract", themeContractExport: "vars" },
      }) as unknown as {
        configResolved?: (config: { root: string; command: "serve" | "build" }) => void;
        configureServer?: (server: unknown) => void;
        buildStart?: () => void;
        load?: (id: string) => string | null | Promise<string | null>;
        handleHotUpdate?: (context: { file: string; read(): Promise<string>; server: unknown; modules: unknown[] }) => Promise<unknown>;
      };
      plugin.configResolved!({ root, command: "serve" });
      plugin.configureServer!(server);
      plugin.buildStart!();

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
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it.each([
    ["unresolved", null, {}, "vanilla-extract-contract-unresolved"],
    ["missing export", "/fixture/contract.ts", {}, "vanilla-extract-contract-missing-export"],
    ["unsupported shape", "/fixture/contract.ts", { vars: "not-an-object" }, "vanilla-extract-contract-unsupported-shape"],
  ])("fails soft with a %s published-contract diagnostic", async (_label, resolvedId, namespace, code) => {
    const plugin = nudgeUi({
      vanillaExtract: { themeContractModule: "@fixture/contract", themeContractExport: "vars" },
    }) as unknown as {
      configResolved?: (config: { root: string; command: "serve" | "build" }) => void;
      configureServer?: (server: unknown) => void;
      load?: (id: string) => string | null | Promise<string | null>;
    };
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
    const root = mkdtempSync(join(tmpdir(), "nudge-ui-invalid-contract-"));
    try {
      writeFileSync(join(root, "app.css"), ':root { --still-available: #123456; }');
      const plugin = nudgeUi({
        vanillaExtract: { themeContractModule: "@fixture/contract", themeContractExport: "vars" },
      }) as unknown as {
        configResolved?: (config: { root: string; command: "serve" | "build" }) => void;
        configureServer?: (server: unknown) => void;
        buildStart?: () => void;
        load?: (id: string) => string | null | Promise<string | null>;
      };
      plugin.configResolved!({ root, command: "serve" });
      plugin.configureServer!({
        pluginContainer: { resolveId: async () => ({ id: "/fixture/contract.ts" }) },
        ssrLoadModule: async () => ({ vars: "invalid" }),
      });
      plugin.buildStart!();

      const virtual = await plugin.load!("\0virtual:design-tokens");
      expect(virtual).toContain("--still-available");
      expect(virtual).toContain("vanilla-extract-contract-unsupported-shape");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps authored Tailwind v4 theme tokens editable project tokens", async () => {
    const root = mkdtempSync(join(tmpdir(), "nudge-ui-catalog-"));
    try {
      writeFileSync(join(root, "app.css"), '@import "tailwindcss"; @theme { --color-brand: #123456; }');
      const plugin = nudgeUi() as unknown as {
        configResolved?: (config: { root: string; command: "serve" | "build" }) => void;
        buildStart?: () => void;
        load?: (id: string) => string | null | Promise<string | null>;
      };
      plugin.configResolved!({ root, command: "serve" });
      plugin.buildStart!();
      const code = await plugin.load!("\0virtual:design-tokens");
      const catalog = JSON.parse(code!.match(/^export const tokenCatalog = (.*);$/m)?.[1] ?? "[]") as Array<{
        cssName: string;
        origin?: string;
        editable?: boolean;
      }>;

      expect(catalog.find((definition) => definition.cssName === "--color-brand")).toMatchObject({
        origin: "project",
        editable: true,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reconciles authored and transformed observations independent of feed order", async () => {
    const build = async (transformFirst: boolean) => {
      const parent = mkdtempSync(join(tmpdir(), "nudge-ui-reconcile-order-"));
      const root = join(parent, "app");
      const appCss = join(root, "app.css");
      try {
        mkdirSync(root, { recursive: true });
        const authored = '@theme { --color-brand: #123456; }';
        const transformed = ':root, :host { --color-brand: #123456; --tw-brand-opacity: 1; }';
        writeFileSync(appCss, authored);
        const [plugin, transformedObserver] = createNudgeUiPlugins() as unknown as [{
          configResolved?: (config: { root: string; command: "serve" | "build" }) => void;
          buildStart?: () => void;
          load?: (id: string) => string | null | Promise<string | null>;
        }, { transform?: (code: string, id: string) => unknown }];
        plugin.configResolved!({ root, command: "serve" });
        if (transformFirst) {
          transformedObserver.transform!(transformed, appCss);
          plugin.buildStart!();
        } else {
          plugin.buildStart!();
          transformedObserver.transform!(transformed, appCss);
        }
        const code = (await plugin.load!("\0virtual:design-tokens"))!;
        return JSON.parse(code.match(/^export const tokenCatalog = (.*);$/m)?.[1] ?? "[]") as Array<{
          cssName: string;
          origin?: string;
          editable?: boolean;
          adapter?: string;
          declarations: Array<{ value: string; context?: { selector?: string } }>;
        }>;
      } finally {
        rmSync(parent, { recursive: true, force: true });
      }
    };

    const authoredFirst = await build(false);
    const transformFirst = await build(true);

    // Cold-start output is identical regardless of which observation lands
    // first — the inventory reconciles the artifact pair deterministically.
    expect(transformFirst).toEqual(authoredFirst);

    // The transformed observation is the browser-relevant fact set...
    expect(authoredFirst.find((entry) => entry.cssName === "--color-brand"))
      .toMatchObject({ declarations: [expect.objectContaining({ value: "#123456", context: { selector: ":root, :host" } })] });
    // ...while authored names keep project provenance and become editable.
    expect(authoredFirst.find((entry) => entry.cssName === "--color-brand"))
      .toMatchObject({ origin: "project", editable: true, adapter: "tailwind-v4" });
    // Compiler-emitted names that have no authored counterpart are framework.
    expect(authoredFirst.find((entry) => entry.cssName === "--tw-brand-opacity"))
      .toMatchObject({ origin: "framework", editable: false, adapter: "tailwind-v4" });
  });

  it("retains the authored snapshot with a recoverable diagnostic when the post-transform request fails", async () => {
    const parent = mkdtempSync(join(tmpdir(), "nudge-ui-transform-failure-"));
    const root = join(parent, "app");
    const appCss = join(root, "app.css");
    try {
      mkdirSync(root, { recursive: true });
      writeFileSync(appCss, ':root { --color-brand: #123456; }');
      const server = {
        pluginContainer: { resolveId: async () => null },
        transformRequest: async () => { throw new Error("transform unavailable"); },
        moduleGraph: activeModuleGraph(appCss),
      };
      const plugin = nudgeUi() as unknown as {
        configResolved?: (config: { root: string; command: "serve" | "build" }) => void;
        configureServer?: (server: unknown) => void;
        buildStart?: () => void;
        load?: (id: string) => string | null | Promise<string | null>;
      };
      plugin.configResolved!({ root, command: "serve" });
      plugin.configureServer!(server);
      plugin.buildStart!();

      const code = await plugin.load!("\0virtual:design-tokens");
      const catalog = JSON.parse(code!.match(/^export const tokenCatalog = (.*);$/m)?.[1] ?? "[]") as Array<{
        cssName: string;
        origin?: string;
        declarations: Array<{ value: string }>;
      }>;

      // The authored observation is retained as the browser-relevant facts.
      expect(catalog.find((definition) => definition.cssName === "--color-brand"))
        .toMatchObject({ origin: "project", declarations: [expect.objectContaining({ value: "#123456" })] });
      // ...and the failed transform surfaces as a recoverable diagnostic.
      expect(code).toContain("transform-observation-failed");
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("records a failed-transform diagnostic on HMR and clears it on recovery", async () => {
    const parent = mkdtempSync(join(tmpdir(), "nudge-ui-transform-hmr-recovery-"));
    const root = join(parent, "app");
    const appCss = join(root, "app.css");
    try {
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
      const [plugin, transformedObserver] = createNudgeUiPlugins() as unknown as [{
        configResolved?: (config: { root: string; command: "serve" | "build" }) => void;
        configureServer?: (server: unknown) => void;
        buildStart?: () => void;
        load?: (id: string) => string | null | Promise<string | null>;
        handleHotUpdate?: (context: { file: string; read(): Promise<string>; server: unknown; modules: unknown[] }) => Promise<unknown>;
      }, { transform?: (code: string, id: string) => unknown }];
      plugin.configResolved!({ root, command: "serve" });
      plugin.configureServer!(server);
      plugin.buildStart!();

      // HMR for an edited file whose post-transform request fails: the authored
      // facts are retained alongside a recoverable diagnostic.
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

      // The transform recovers: the pipeline feeds the transformed observation,
      // which clears the diagnostic and keeps the authored facts as the facts.
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
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("treats an unreadable HMR file as a removal, not a failed transform", async () => {
    const parent = mkdtempSync(join(tmpdir(), "nudge-ui-transform-removal-"));
    const root = join(parent, "app");
    const appCss = join(root, "app.css");
    try {
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
      const plugin = nudgeUi() as unknown as {
        configResolved?: (config: { root: string; command: "serve" | "build" }) => void;
        configureServer?: (server: unknown) => void;
        buildStart?: () => void;
        load?: (id: string) => string | null | Promise<string | null>;
        handleHotUpdate?: (context: { file: string; read(): Promise<string>; server: unknown; modules: unknown[] }) => Promise<unknown>;
      };
      plugin.configResolved!({ root, command: "serve" });
      plugin.configureServer!(server);
      plugin.buildStart!();
      expect(await plugin.load!("\0virtual:design-tokens")).toContain("--color-brand");

      // The file is deleted: ctx.read() throws and the disk scan no longer sees
      // it, so rows are removed and NO transform-observation-failed diagnostic
      // is recorded for the removal.
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
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("publishes the inventory snapshot verbatim, with styling contributions merged inside it", async () => {
    const parent = mkdtempSync(join(tmpdir(), "nudge-ui-snapshot-verbatim-"));
    const root = join(parent, "app");
    const appCss = join(root, "app.css");
    const packageRoot = join(parent, "node_modules", "@fixture");
    const themeCss = join(packageRoot, "theme.css");
    const contractId = join(packageRoot, "contract.ts");
    const appContent = '@import "@fixture/theme.css"; @theme { --color-brand: #123456; }';
    const themeContent = ':root { --color-content-primary: #20211f; }';
    const contract = { vars: { color: { content: { primary: "var(--color-content-primary)" } } } };
    try {
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
      const plugin = nudgeUi({
        vanillaExtract: { themeContractModule: "@fixture/contract", themeContractExport: "vars" },
      }) as unknown as {
        configResolved?: (config: { root: string; command: "serve" }) => void;
        configureServer?: (server: unknown) => void;
        buildStart?: () => void;
        load?: (id: string) => string | null | Promise<string | null>;
      };
      plugin.configResolved!({ root, command: "serve" });
      plugin.configureServer!(server);
      plugin.buildStart!();

      const code = (await plugin.load!("\0virtual:design-tokens"))!;
      const published = {
        catalog: JSON.parse(code.match(/^export const tokenCatalog = (.*);$/m)?.[1] ?? "[]"),
        tokens: JSON.parse(code.match(/^export const tokens = (.*);$/m)?.[1] ?? "[]"),
        generation: JSON.parse(code.match(/^export const tokenGeneration = (.*);$/m)?.[1] ?? '""'),
      };

      // Rebuild the inventory from the same observable facts and contributions.
      // If load() still post-processed the snapshot, the published catalog,
      // tokens, or generation would diverge from this engine output.
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
      expected.applyContribution({ id: "adapter-registry", order: -1, tokens: [] });
      expected.applyContribution(createTailwindV4NamingContribution());
      expected.applyContribution(materializeVanillaExtractContribution(contract.vars, {
        source: "@fixture/contract",
        origin: "package",
      }));
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
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("bumps the published generation exactly once per observable HMR change and treats an identical follow-up as a no-op", async () => {
    const parent = mkdtempSync(join(tmpdir(), "nudge-ui-hmr-once-"));
    const root = join(parent, "app");
    const appCss = join(root, "app.css");
    try {
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
      const plugin = nudgeUi() as unknown as {
        configResolved?: (config: { root: string; command: "serve" | "build" }) => void;
        configureServer?: (server: unknown) => void;
        buildStart?: () => void;
        load?: (id: string) => string | null | Promise<string | null>;
        handleHotUpdate?: (context: { file: string; read(): Promise<string>; server: unknown; modules: unknown[] }) => Promise<unknown>;
      };
      plugin.configResolved!({ root, command: "serve" });
      plugin.configureServer!(server);
      plugin.buildStart!();

      const generation = async () => {
        const code = (await plugin.load!("\0virtual:design-tokens"))!;
        return JSON.parse(code.match(/^export const tokenGeneration = (.*);$/m)?.[1] ?? '""') as string;
      };

      const first = await generation();
      expect(first).toMatch(/^g[0-9a-f]+$/);

      // Change: one observable snapshot change -> exactly one invalidation and
      // a new generation, even though the event feeds authored + graph facts.
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

      // Genuinely different content bumps exactly once more.
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
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("publishes real watcher add and unlink events exactly once", async () => {
    const root = mkdtempSync(join(tmpdir(), "nudge-ui-watch-hmr-"));
    const addedCss = join(root, "added.css");
    try {
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
      const plugin = nudgeUi() as unknown as {
        configResolved(config: { root: string; command: "serve" }): void;
        configureServer(server: unknown): void;
        buildStart(): void;
        load(id: string): string | null | Promise<string | null>;
      };
      plugin.configResolved({ root, command: "serve" });
      plugin.configureServer(server);
      plugin.buildStart();
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
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("bumps the published generation exactly once for a theme-contract HMR change and ignores an identical refresh", async () => {
    const parent = mkdtempSync(join(tmpdir(), "nudge-ui-contract-hmr-once-"));
    const root = join(parent, "app");
    const contractId = join(root, "contract.ts");
    try {
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
      const plugin = nudgeUi({
        vanillaExtract: { themeContractModule: "@fixture/contract", themeContractExport: "vars" },
      }) as unknown as {
        configResolved?: (config: { root: string; command: "serve" | "build" }) => void;
        configureServer?: (server: unknown) => void;
        buildStart?: () => void;
        load?: (id: string) => string | null | Promise<string | null>;
        handleHotUpdate?: (context: { file: string; read(): Promise<string>; server: unknown; modules: unknown[] }) => Promise<unknown>;
      };
      plugin.configResolved!({ root, command: "serve" });
      plugin.configureServer!(server);
      plugin.buildStart!();

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
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
