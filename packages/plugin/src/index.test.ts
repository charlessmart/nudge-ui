import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
