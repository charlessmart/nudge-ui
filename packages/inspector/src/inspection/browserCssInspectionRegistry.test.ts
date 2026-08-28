// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  bindBrowserCssInspection,
  disposeBrowserCssInspection,
  getBrowserCssInspection,
} from "./browserCssInspectionRegistry.ts";
import { setDesignTokensStub } from "../__stubs__/design-tokens.ts";
import {
  configureNudgeUiRuntime,
  getNudgeUiRuntimeConfig,
} from "../runtimeConfig.ts";

afterEach(() => {
  setDesignTokensStub([], "");
  disposeBrowserCssInspection(document);
  document.body.innerHTML = "";
});

describe("browser CSS inspection registry", () => {
  it("keeps one session per document and separates iframe documents", () => {
    const first = getBrowserCssInspection(document);
    const second = getBrowserCssInspection(document);
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const frame = getBrowserCssInspection(iframe.contentDocument!);

    expect(second).toBe(first);
    expect(frame).not.toBe(first);

    disposeBrowserCssInspection(iframe.contentDocument!);
  });

  it("creates a fresh session after disposal", () => {
    const first = getBrowserCssInspection(document);
    disposeBrowserCssInspection(document);

    expect(getBrowserCssInspection(document)).not.toBe(first);
  });

  it("recreates the document session when token knowledge generation changes", () => {
    const first = bindBrowserCssInspection(document, {
      definitions: [],
      generation: 1,
    });
    const same = bindBrowserCssInspection(document, {
      definitions: [],
      generation: 1,
    });
    const next = bindBrowserCssInspection(document, {
      definitions: [],
      generation: 2,
    });

    expect(same).toBe(first);
    expect(next).not.toBe(first);
    expect(first.inspect(document.createElement("div")).target.status).toBe("disposed");
    expect(next.inspect(document.createElement("div")).target.status).toBe("detached");
  });

  it("recreates for post-snapshot catalog enrichment without churning on identical transport", () => {
    setDesignTokensStub([], "g-same");
    const first = getBrowserCssInspection(document);
    const enriched = [{
      cssName: "--surface",
      name: "theme.surface",
      adapter: "vanilla-extract",
      declarations: [{ value: "#fff", source: "theme.css:1", important: false, context: {} }],
    }];

    setDesignTokensStub(enriched, "g-same");
    const next = getBrowserCssInspection(document);
    setDesignTokensStub(enriched.map((definition) => ({ ...definition })), "g-same");

    expect(next).not.toBe(first);
    expect(getBrowserCssInspection(document)).toBe(next);
    expect(first.inspect(document.createElement("div")).target.status).toBe("disposed");
  });

  it("refreshes a live document session when the host replaces token generation", () => {
    const current = getNudgeUiRuntimeConfig();
    configureNudgeUiRuntime({
      ...current,
      tokenCatalog: [],
      tokenGeneration: "g-live-1",
    });
    const first = getBrowserCssInspection(document);

    configureNudgeUiRuntime({
      ...current,
      tokenCatalog: [],
      tokenGeneration: "g-live-2",
    });
    const next = getBrowserCssInspection(document);

    expect(next).not.toBe(first);
    expect(first.inspect(document.createElement("div")).target.status).toBe("disposed");
    expect(next.inspect(document.createElement("div")).revision.tokenGeneration).toMatch(/^g-live-2(?::\d+)?$/);
  });
});
