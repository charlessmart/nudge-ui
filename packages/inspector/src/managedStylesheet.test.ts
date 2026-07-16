// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ensureManagedSheet, applyRules, escapeAttrValue, rulesToCssText, verifyPreview } from "./managedStylesheet.ts";
import type { StyleRule } from "./managedStylesheet.ts";

const SHEET_ID = "design-tool-styles";

describe("ensureManagedSheet", () => {
  afterEach(() => {
    document.getElementById(SHEET_ID)?.remove();
  });

  it("injects a single <style id='design-tool-styles'> into document.head", () => {
    expect(document.getElementById(SHEET_ID)).toBeNull();
    const sheet = ensureManagedSheet();
    const el = document.getElementById(SHEET_ID) as HTMLStyleElement | null;
    expect(el).not.toBeNull();
    expect(el!.tagName).toBe("STYLE");
    expect(el!.getAttribute("id")).toBe(SHEET_ID);
    expect(sheet).toBe(el!.sheet);
  });

  it("is idempotent — calling twice returns the same sheet", () => {
    const a = ensureManagedSheet();
    const b = ensureManagedSheet();
    expect(a).toBe(b);
    expect(document.querySelectorAll(`#${SHEET_ID}`).length).toBe(1);
  });

  it("reuses the existing sheet across calls even after external removal+re-add", () => {
    const a = ensureManagedSheet();
    document.getElementById(SHEET_ID)?.remove();
    const b = ensureManagedSheet();
    expect(a).not.toBe(b);
    expect(document.querySelectorAll(`#${SHEET_ID}`).length).toBe(1);
  });
});

describe("applyRules", () => {
  afterEach(() => {
    document.getElementById(SHEET_ID)?.remove();
  });

  it("writes the expected CSS text for a single rule", () => {
    applyRules([
      {
        selector: '[data-cid="Button"][data-src*="src/Button.tsx:1"]',
        declarations: { background: "var(--color-surface-sunken)", "border-radius": "8px" },
      },
    ]);
    const el = document.getElementById(SHEET_ID) as HTMLStyleElement;
    expect(el.textContent).toContain('[data-cid="Button"][data-src*="src/Button.tsx:1"]');
    expect(el.textContent).toContain("background: var(--color-surface-sunken);");
    expect(el.textContent).toContain("border-radius: 8px;");
  });

  it("overwrites old rules entirely (does not append)", () => {
    applyRules([{ selector: ".a", declarations: { color: "red" } }]);
    applyRules([{ selector: ".b", declarations: { color: "blue" } }]);
    const el = document.getElementById(SHEET_ID) as HTMLStyleElement;
    expect(el.textContent).not.toContain(".a");
    expect(el.textContent).not.toContain("color: red;");
    expect(el.textContent).toContain(".b");
    expect(el.textContent).toContain("color: blue;");
  });

  it("is idempotent for identical input (replaceSync semantics, no duplicates)", () => {
    const rules: StyleRule[] = [{ selector: ".a", declarations: { color: "red" } }];
    applyRules(rules);
    const before = (document.getElementById(SHEET_ID) as HTMLStyleElement).textContent;
    applyRules(rules);
    const after = (document.getElementById(SHEET_ID) as HTMLStyleElement).textContent;
    expect(after).toBe(before);
    const matches = (after ?? "").split(".a").length - 1;
    expect(matches).toBe(1);
  });

  it("omits entries with empty property or value", () => {
    applyRules([{ selector: ".a", declarations: { "": "red", color: "" } }]);
    expect((document.getElementById(SHEET_ID) as HTMLStyleElement).textContent).not.toContain(": red");
    expect((document.getElementById(SHEET_ID) as HTMLStyleElement).textContent).not.toContain("color:");
  });

  it("rulesToCssText emits each rule on its own line", () => {
    const css = rulesToCssText([
      { selector: ".a", declarations: { color: "red" } },
      { selector: ".b", declarations: { margin: "0" } },
    ]);
    expect(css).toContain(".a { color: red; }");
    expect(css).toContain(".b { margin: 0; }");
  });

  it("preserves conditional context for global token rules", () => {
    const css = rulesToCssText([{
      selector: ':root[data-theme="dark"]',
      declarations: { "--color-text": "#eeeeee" },
      context: {
        layer: "theme",
        media: "(prefers-color-scheme: dark)",
        supports: "(color: oklch(0 0 0))",
        scope: "(.app)",
      },
    }]);
    expect(css).toBe('@layer theme { @media (prefers-color-scheme: dark) { @supports (color: oklch(0 0 0)) { @scope (.app) { :root[data-theme="dark"] { --color-text: #eeeeee; } } } } }');
  });
});

describe("escapeAttrValue", () => {
  it("escapes backslash, double-quote and closing bracket", () => {
    expect(escapeAttrValue('But]ton"')).toBe('But\\]ton\\"');
    expect(escapeAttrValue("a\\b")).toBe("a\\\\b");
  });

  it("produces a selector round-trip that matches an element with the raw value", () => {
    document.body.innerHTML = '<button data-cid="But]ton" data-src="src/Button.tsx:1:1">x</button>';
    const el = document.querySelector("button") as HTMLButtonElement;
    const cid = el.getAttribute("data-cid") ?? "";
    const escaped = escapeAttrValue(cid);
    const selector = `[data-cid="${escaped}"]`;
    expect(el.matches(selector)).toBe(true);
    document.body.innerHTML = "";
  });
});

describe("verifyPreview", () => {
  beforeEach(() => { document.body.innerHTML = '<div id="target"></div>'; });
  afterEach(() => { document.body.innerHTML = ""; document.getElementById(SHEET_ID)?.remove(); });

  it("reports applied only when computed style equals the request", () => {
    const target = document.querySelector("#target") as HTMLElement;
    applyRules([{ selector: "#target", declarations: { display: "block" } }]);
    expect(verifyPreview(target, "display", "block")).toEqual({ requestedValue: "block", computedValue: "block", status: "applied" });
  });

  it("resolves token requests before comparing them with computed output", () => {
    const target = document.querySelector("#target") as HTMLElement;
    document.documentElement.style.setProperty("--test-display", "block");
    applyRules([{ selector: "#target", declarations: { display: "var(--test-display)" } }]);
    expect(verifyPreview(target, "display", "var(--test-display)").status).toBe("applied");
    document.documentElement.style.removeProperty("--test-display");
  });

  it("classifies inline and important conflicts", () => {
    const target = document.querySelector("#target") as HTMLElement;
    target.style.setProperty("display", "grid");
    expect(verifyPreview(target, "display", "block").reason).toBe("inline-style");
    target.style.setProperty("display", "grid", "important");
    expect(verifyPreview(target, "display", "block").reason).toBe("important");
  });

  it("classifies higher specificity, animation and transition conflicts", () => {
    const target = document.querySelector("#target") as HTMLElement;
    expect(verifyPreview(target, "display", "grid").reason).toBe("higher-specificity");
    Object.defineProperty(target, "getAnimations", { configurable: true, value: () => [{ playState: "running" }] });
    expect(verifyPreview(target, "display", "grid").reason).toBe("animation");
    Object.defineProperty(target, "getAnimations", { configurable: true, value: () => [] });
    target.style.transitionProperty = "display";
    target.style.transitionDuration = "1s";
    expect(verifyPreview(target, "display", "grid").reason).toBe("transition");
  });

  it("reports a missing instance target without broadening", () => {
    expect(verifyPreview(null, "color", "red").reason).toBe("target-missing");
  });

  it("verifies a custom-property override on its real target", () => {
    applyRules([{ selector: ":root", declarations: { "--brand": "blue" } }]);
    expect(verifyPreview(document.documentElement, "--brand", "blue").status).toBe("applied");
  });
});
