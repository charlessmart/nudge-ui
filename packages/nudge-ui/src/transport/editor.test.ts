import { describe, expect, it } from "vitest";
import {
  createNudgeUiDirectUrl,
  createNudgeUiEditorDocument,
  createNudgeUiEditorUrl,
  hasNudgeUiDirectTabIntent,
  isNudgeUiDirectUrl,
  isNudgeUiEditorDocumentRequest,
  rememberNudgeUiDirectTabIntent,
  readNudgeUiEditorTarget,
} from "./editor.ts";

describe("editor transport", () => {
  it("round-trips the complete same-origin application location", () => {
    const application = "https://example.test/products?q=linen%20shirt#details";
    const editor = createNudgeUiEditorUrl(application);

    expect(editor).toBe("https://example.test/products?q=linen%20shirt&nudge-ui=editor#details");
    expect(readNudgeUiEditorTarget(editor)).toBe(application);
  });

  it("removes only the owned marker and retains legacy editor links", () => {
    expect(createNudgeUiEditorUrl("https://example.test/products?")).toBe(
      "https://example.test/products?nudge-ui=editor",
    );
    expect(readNudgeUiEditorTarget(
      "https://example.test/products?nudge-ui=app&q=linen&nudge-ui=editor#details",
    )).toBe("https://example.test/products?nudge-ui=app&q=linen#details");
    expect(readNudgeUiEditorTarget(
      "https://example.test/__nudge_ui__/editor?url=%2Fproducts%3Fq%3Dlinen%23details",
    )).toBe("https://example.test/products?q=linen#details");
  });

  it("replaces the direct-view marker without rewriting application parameters", () => {
    expect(createNudgeUiEditorUrl(
      "https://example.test/products?q=linen%20shirt&__nudge_ui_direct=1&flag=%2F#details",
    )).toBe("https://example.test/products?q=linen%20shirt&flag=%2F&nudge-ui=editor#details");
  });

  it("recognizes only marked document GET and HEAD requests", () => {
    const url = "/products?q=linen&nudge-ui=editor";
    expect(isNudgeUiEditorDocumentRequest(url, "GET", { accept: "text/html" })).toBe(true);
    expect(isNudgeUiEditorDocumentRequest(url, "HEAD", { "sec-fetch-dest": "document" })).toBe(true);
    expect(isNudgeUiEditorDocumentRequest(url, "GET", { accept: "application/json" })).toBe(false);
    expect(isNudgeUiEditorDocumentRequest(url, "POST", { accept: "text/html" })).toBe(false);
    expect(isNudgeUiEditorDocumentRequest("/__nudge_ui__/editor?url=%2Fproducts", "GET", undefined)).toBe(true);
  });

  it("rejects targets that could recurse into or escape the editor host", () => {
    expect(readNudgeUiEditorTarget(
      "https://example.test/__nudge_ui__/editor?url=https%3A%2F%2Fevil.test%2F",
    )).toBeNull();
    expect(readNudgeUiEditorTarget(
      "https://example.test/__nudge_ui__/editor?url=%2F__nudge_ui__%2Feditor",
    )).toBeNull();
    expect(() => createNudgeUiEditorUrl("file:///tmp/index.html")).toThrow(TypeError);
  });

  it("serves a pure shell and keeps direct application views direct across refresh", () => {
    const html = createNudgeUiEditorDocument();
    const direct = createNudgeUiDirectUrl("https://example.test/products?sort=price#details");

    expect(html).toContain("<html lang=\"en\" data-nudge-ui-editor>");
    expect(html).toContain('<div id="nudge-ui-root"></div>');
    expect(html).toContain('src="/__nudge_ui__/client.mjs"');
    expect(html).not.toContain("products");
    expect(isNudgeUiDirectUrl(direct)).toBe(true);
    expect(new URL(direct).hash).toBe("#details");
  });

  it("keeps a direct application tab direct after its URL marker is removed", () => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    expect(hasNudgeUiDirectTabIntent()).toBe(false);
    rememberNudgeUiDirectTabIntent();
    expect(hasNudgeUiDirectTabIntent()).toBe(true);
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  });
});
