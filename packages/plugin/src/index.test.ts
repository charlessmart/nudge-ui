import { describe, it, expect } from "vitest";
import {
  designTool,
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