import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  designTool,
  isHostApplicationSource,
  transformIndexHtmlHtml,
} from "./index.ts";

const SAMPLE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <title>Sandbox</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

describe("isHostApplicationSource", () => {
  const root = join(tmpdir(), "design-tool-app");

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
    expect(isHostApplicationSource("\0virtual:design-tool-inspector", root))
      .toBe(false);
  });
});

describe("transformIndexHtmlHtml", () => {
  it("injects the mount div + script before </body> in serve mode", () => {
    const out = transformIndexHtmlHtml(SAMPLE_HTML, "serve");
    expect(out).not.toBeNull();
    expect(out!).toContain('<div id="design-tool-root"></div>');
    expect(out!).toContain(
      '<script type="module" src="/@id/__x00__virtual:design-tool-inspector"></script>',
    );
    expect(out!.indexOf("<body>")).toBeLessThan(out!.indexOf('id="design-tool-root"'));
    expect(out!.indexOf('id="design-tool-root"')).toBeLessThan(out!.lastIndexOf("</body>"));
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
    expect(out!).toContain('<div id="design-tool-root"></div>');
    expect(out!.endsWith("<div id=\"design-tool-root\"></div>\n<script type=\"module\" src=\"/@id/__x00__virtual:design-tool-inspector\"></script>\n")).toBe(true);
  });
});

describe("designTool plugin virtual inspector module", () => {
  it("orders identity transforms before other pre transforms", () => {
    const plugin = designTool() as unknown as {
      transform?: { order?: string };
    };
    expect(plugin.transform).toMatchObject({ order: "pre" });
  });

  it("resolveId maps both bare and resolved forms of the inspector virtual id", () => {
    const plugin = designTool() as unknown as {
      resolveId?: (id: string) => string | null;
      load?: (id: string) => string | null | Promise<string | null>;
    };
    expect(plugin.resolveId!("virtual:design-tool-inspector")).toBe(
      "\0virtual:design-tool-inspector",
    );
    expect(plugin.resolveId!("\0virtual:design-tool-inspector")).toBe(
      "\0virtual:design-tool-inspector",
    );
  });

  it("load emits a bootstrap that calls bootstrapDesignTool (default command is serve)", async () => {
    const plugin = designTool() as unknown as {
      load?: (id: string) => string | null | Promise<string | null>;
    };
    const code = await plugin.load!("\0virtual:design-tool-inspector");
    expect(code).not.toBeNull();
    expect(code!).toContain('from "@design-tool/inspector"');
    expect(code!).toContain("bootstrapDesignTool");
    expect(code!).toContain('getElementById("design-tool-root")');
  });
});

describe("designTool component contract catalog", () => {
  it("scans local TypeScript component contracts into a dev virtual module", async () => {
    const root = mkdtempSync(join(tmpdir(), "design-tool-components-"));
    try {
      writeFileSync(
        join(root, "Button.tsx"),
        `export function Button(props: { variant: "primary" | "secondary"; disabled?: boolean }) { return <button /> }`,
      );
      const plugin = designTool() as unknown as {
        configResolved?: (config: { root: string; command: "serve" | "build" }) => void;
        buildStart?: () => void;
        resolveId?: (id: string) => string | null;
        load?: (id: string) => string | null | Promise<string | null>;
      };
      plugin.configResolved!({ root, command: "serve" });
      plugin.buildStart!();
      expect(plugin.resolveId!("virtual:design-tool-components")).toBe(
        "\0virtual:design-tool-components",
      );
      const code = await plugin.load!("\0virtual:design-tool-components");
      expect(code).toContain('"componentId":"Button#Button"');
      expect(code).toContain('"options":["primary","secondary"]');
      expect(code).toContain('"control":"boolean"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns an empty component catalog for production builds", async () => {
    const plugin = designTool() as unknown as {
      configResolved?: (config: { root: string; command: "serve" | "build" }) => void;
      load?: (id: string) => string | null | Promise<string | null>;
    };
    plugin.configResolved!({ root: "/project", command: "build" });
    expect(await plugin.load!("\0virtual:design-tool-components")).toContain(
      "componentContracts = []",
    );
  });

  it("merges package-published component metadata into the dev catalog", async () => {
    const plugin = designTool({
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
    expect(await plugin.load!("\0virtual:design-tool-components"))
      .toContain('"componentId":"@work/design-system#Button"');
  });
});

describe("designTool token catalog compiler", () => {
  it("discovers only Vite-resolved package CSS imports with package provenance", async () => {
    const parent = mkdtempSync(join(tmpdir(), "design-tool-package-css-"));
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
      };
      const plugin = designTool() as unknown as {
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

  it("ignores conventional build output when compiling the dev token catalog", async () => {
    const parent = mkdtempSync(join(tmpdir(), "design-tool-build-output-"));
    const root = join(parent, "app");
    const sourceCss = join(root, "app.css");
    const outputCss = join(root, "build", "client", "app.css");
    try {
      mkdirSync(join(root, "build", "client"), { recursive: true });
      writeFileSync(sourceCss, ":root { --color-content-primary: #20211f; }");
      writeFileSync(outputCss, ":root { --color-content-primary: #ffffff; }");

      const plugin = designTool() as unknown as {
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
    const parent = mkdtempSync(join(tmpdir(), "design-tool-package-css-exports-"));
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
      };
      const plugin = designTool() as unknown as {
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
    const parent = mkdtempSync(join(tmpdir(), "design-tool-package-css-hmr-"));
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
          getModuleById: (id: string) => id === "\0virtual:design-tokens" ? virtual : undefined,
          invalidateModule: () => undefined,
        },
      };
      const plugin = designTool() as unknown as {
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
    const parent = mkdtempSync(join(tmpdir(), "design-tool-vanilla-contract-"));
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
      let contract: Record<string, unknown> = {
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
          getModuleById: (id: string) => id === "\0virtual:design-tokens" ? virtual : undefined,
          invalidateModule: () => undefined,
        },
      };
      const plugin = designTool({
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
      expect(code).toContain('"name":"theme.color.content.secondary"');
      expect(code).not.toContain('"name":"theme.color.content.primary"');
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it.each([
    ["unresolved", null, {}, "vanilla-extract-contract-unresolved"],
    ["missing export", "/fixture/contract.ts", {}, "vanilla-extract-contract-missing-export"],
    ["unsupported shape", "/fixture/contract.ts", { vars: "not-an-object" }, "vanilla-extract-contract-unsupported-shape"],
  ])("fails soft with a %s published-contract diagnostic", async (_label, resolvedId, namespace, code) => {
    const plugin = designTool({
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
    const root = mkdtempSync(join(tmpdir(), "design-tool-invalid-contract-"));
    try {
      writeFileSync(join(root, "app.css"), ':root { --still-available: #123456; }');
      const plugin = designTool({
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
    const root = mkdtempSync(join(tmpdir(), "design-tool-catalog-"));
    try {
      writeFileSync(join(root, "app.css"), '@import "tailwindcss"; @theme { --color-brand: #123456; }');
      const plugin = designTool() as unknown as {
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
});
