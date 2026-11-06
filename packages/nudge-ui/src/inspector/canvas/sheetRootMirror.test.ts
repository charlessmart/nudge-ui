// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { copyRootAttributes } from "./sheetRootMirror.ts";

describe("copyRootAttributes", () => {
  it("copies theme attributes, skips Nudge's own, and removes ones the app dropped", () => {
    const app = document.createElement("html");
    const sheet = document.createElement("html");
    app.setAttribute("class", "ds-color-scheme-dark");
    app.setAttribute("data-theme", "dark");
    app.setAttribute("data-nudge-ui-panel", "open");
    app.setAttribute("style", "--x: 1");
    copyRootAttributes(app, sheet);
    expect(sheet.getAttribute("class")).toBe("ds-color-scheme-dark");
    expect(sheet.getAttribute("data-theme")).toBe("dark");
    expect(sheet.hasAttribute("data-nudge-ui-panel")).toBe(false);
    expect(sheet.hasAttribute("style")).toBe(false);

    app.removeAttribute("data-theme");
    copyRootAttributes(app, sheet);
    expect(sheet.hasAttribute("data-theme")).toBe(false);
  });
});
