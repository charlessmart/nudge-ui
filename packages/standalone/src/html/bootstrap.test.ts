import { describe, expect, it } from "vitest";
import {
  DESIGN_TOOL_CLIENT_PATH,
  DESIGN_TOOL_MANIFEST_PATH,
} from "../manifest.ts";
import { injectStandaloneBootstrap } from "./bootstrap.ts";

describe("injectStandaloneBootstrap", () => {
  it("inserts an external mount and client before body close", () => {
    const source = "<!doctype html><body><main>Prototype</main></body>";
    const result = injectStandaloneBootstrap(source);

    expect(result.injected).toBe(true);
    expect(result.html).toContain("<div id=\"design-tool-root\" data-design-tool-mount></div>");
    expect(result.html).toContain(
      "<script type=\"module\" src=\"" + DESIGN_TOOL_CLIENT_PATH
        + "\" data-design-tool-client data-design-tool-manifest=\"" + DESIGN_TOOL_MANIFEST_PATH
        + "\"></script>",
    );
    expect(result.html.indexOf("design-tool-root")).toBeLessThan(
      result.html.indexOf("</body>"),
    );
  });

  it("is idempotent when the response is transformed twice", () => {
    const source = "<html><body><button>Save</button></body></html>";
    const first = injectStandaloneBootstrap(source).html;
    const second = injectStandaloneBootstrap(first);

    expect(second.injected).toBe(false);
    expect(second.html).toBe(first);
    expect(first.match(/data-design-tool-mount/g)).toHaveLength(1);
    expect(first.match(/data-design-tool-client/g)).toHaveLength(1);
  });

  it("adds only missing nodes and preserves an authored mount", () => {
    const source = "<body><div id=\"design-tool-root\">author content</div></body>";
    const result = injectStandaloneBootstrap(source);

    expect(result.html).toContain("id=\"design-tool-root\">author content");
    expect(result.html.match(/id=\"design-tool-root\"/g)).toHaveLength(1);
    expect(result.html.match(/data-design-tool-client/g)).toHaveLength(1);
  });

  it("supports custom paths without embedding executable configuration", () => {
    const result = injectStandaloneBootstrap("<body></body>", {
      clientPath: "/assets/client.mjs",
      manifestPath: "/assets/manifest.json",
      mountId: "prototype-inspector",
    });

    expect(result.html).toContain("id=\"prototype-inspector\"");
    expect(result.html).toContain("src=\"/assets/client.mjs\"");
    expect(result.html).toContain("data-design-tool-manifest=\"/assets/manifest.json\"");
    expect(result.html).not.toContain("<script>window");
  });

  it("ignores bootstrap-like text inside scripts", () => {
    const source = `<body><script>const sample = '</body><div id="design-tool-root">';</script><main>Page</main></body>`;

    const result = injectStandaloneBootstrap(source);

    expect(result.html.indexOf("data-design-tool-mount")).toBeGreaterThan(
      result.html.indexOf("<main>Page</main>"),
    );
    expect(result.html.indexOf("data-design-tool-mount")).toBeLessThan(
      result.html.lastIndexOf("</body>"),
    );
  });
});
