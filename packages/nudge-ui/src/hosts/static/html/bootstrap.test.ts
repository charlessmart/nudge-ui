import { describe, expect, it } from "vitest";
import {
  NUDGE_UI_CLIENT_PATH,
  NUDGE_UI_MANIFEST_PATH,
} from "../manifest.ts";
import { injectStandaloneBootstrap } from "./bootstrap.ts";

describe("injectStandaloneBootstrap", () => {
  it("inserts an external mount and client before body close", () => {
    const source = "<!doctype html><body><main>Prototype</main></body>";
    const result = injectStandaloneBootstrap(source);

    expect(result.injected).toBe(true);
    expect(result.html).toContain("<div id=\"nudge-ui-root\" data-nudge-ui-mount></div>");
    expect(result.html).toContain(
      "<script type=\"module\" src=\"" + NUDGE_UI_CLIENT_PATH
        + "\" data-nudge-ui-client data-nudge-ui-manifest=\"" + NUDGE_UI_MANIFEST_PATH
        + "\"></script>",
    );
    expect(result.html.indexOf("nudge-ui-root")).toBeLessThan(
      result.html.indexOf("</body>"),
    );
  });

  it("is idempotent when the response is transformed twice", () => {
    const source = "<html><body><button>Save</button></body></html>";
    const first = injectStandaloneBootstrap(source).html;
    const second = injectStandaloneBootstrap(first);

    expect(second.injected).toBe(false);
    expect(second.html).toBe(first);
    expect(first.match(/data-nudge-ui-mount/g)).toHaveLength(1);
    expect(first.match(/data-nudge-ui-client/g)).toHaveLength(1);
  });

  it("adds only missing nodes and preserves an authored mount", () => {
    const source = "<body><div id=\"nudge-ui-root\">author content</div></body>";
    const result = injectStandaloneBootstrap(source);

    expect(result.html).toContain("id=\"nudge-ui-root\">author content");
    expect(result.html.match(/id=\"nudge-ui-root\"/g)).toHaveLength(1);
    expect(result.html.match(/data-nudge-ui-client/g)).toHaveLength(1);
  });

  it("supports custom paths without embedding executable configuration", () => {
    const result = injectStandaloneBootstrap("<body></body>", {
      clientPath: "/assets/client.mjs",
      manifestPath: "/assets/manifest.json",
    });

    expect(result.html).toContain("id=\"nudge-ui-root\"");
    expect(result.html).toContain("src=\"/assets/client.mjs\"");
    expect(result.html).toContain("data-nudge-ui-manifest=\"/assets/manifest.json\"");
    expect(result.html).not.toContain("<script>window");
  });

  it("does not treat inert template content as a live mount or client", () => {
    const source = `<body><template><div id="nudge-ui-root"></div><script data-nudge-ui-client></script></template><main>Page</main></body>`;

    const result = injectStandaloneBootstrap(source);

    expect(result.injected).toBe(true);
    expect(result.html.match(/id="nudge-ui-root"/g)).toHaveLength(2);
    expect(result.html.match(/data-nudge-ui-client/g)).toHaveLength(2);
    expect(result.html).toContain("<main>Page</main>");
  });

  it("ignores bootstrap-like text inside scripts", () => {
    const source = `<body><script>const sample = '</body><div id="nudge-ui-root">';</script><main>Page</main></body>`;

    const result = injectStandaloneBootstrap(source);

    expect(result.html.indexOf("data-nudge-ui-mount")).toBeGreaterThan(
      result.html.indexOf("<main>Page</main>"),
    );
    expect(result.html.indexOf("data-nudge-ui-mount")).toBeLessThan(
      result.html.lastIndexOf("</body>"),
    );
  });
});
