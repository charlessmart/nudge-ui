// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  disposeBrowserCssInspection,
  getBrowserCssInspection,
} from "./browserCssInspectionRegistry.ts";

afterEach(() => {
  disposeBrowserCssInspection(document);
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
});
