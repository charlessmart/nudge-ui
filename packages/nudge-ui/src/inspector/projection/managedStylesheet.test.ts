// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ensureManagedSheet, applyRules, escapeAttrValue, rulesToCssText, verifyPreview, getManagedSheetText, removeManagedSheet } from "./managedStylesheet.ts";
import { disposeBrowserCssInspection, getBrowserCssInspection } from "../inspection/browserCssInspectionRegistry.ts";
import type { StyleRule } from "./managedStylesheet.ts";

const SHEET_ID = "nudge-ui-styles";

describe("ensureManagedSheet", () => {
  afterEach(() => {
    removeManagedSheet();
    disposeBrowserCssInspection(document);
  });

  it("injects a single <style id='nudge-ui-styles'> into document.head", () => {
    expect(document.getElementById(SHEET_ID)).toBeNull();
    ensureManagedSheet();
    const el = document.getElementById(SHEET_ID) as HTMLStyleElement | null;
    expect(el).not.toBeNull();
    expect(el!.tagName).toBe("STYLE");
    expect(el!.getAttribute("id")).toBe(SHEET_ID);
    expect(el!.sheet).not.toBeNull();
  });

  it("is idempotent — calling twice returns the same sheet", () => {
    ensureManagedSheet();
    const firstSheet = (document.getElementById(SHEET_ID) as HTMLStyleElement).sheet;
    ensureManagedSheet();
    expect((document.getElementById(SHEET_ID) as HTMLStyleElement).sheet).toBe(firstSheet);
    expect(document.querySelectorAll(`#${SHEET_ID}`).length).toBe(1);
  });

  it("reuses the existing sheet across calls even after external removal+re-add", () => {
    ensureManagedSheet();
    const firstSheet = (document.getElementById(SHEET_ID) as HTMLStyleElement).sheet;
    document.getElementById(SHEET_ID)?.remove();
    ensureManagedSheet();
    expect((document.getElementById(SHEET_ID) as HTMLStyleElement).sheet).not.toBe(firstSheet);
    expect(document.querySelectorAll(`#${SHEET_ID}`).length).toBe(1);
  });
});

describe("applyRules", () => {
  afterEach(() => {
    removeManagedSheet();
    disposeBrowserCssInspection(document);
  });

  it("writes the expected CSS text for a single rule", () => {
    applyRules([
      {
        selector: '[data-cid="Button"][data-src*="src/Button.tsx:1"]',
        declarations: { background: "var(--color-surface-sunken)", "border-radius": "8px" },
      },
    ]);
    expect(getManagedSheetText()).toContain('[data-cid="Button"][data-src*="src/Button.tsx:1"]');
    expect(getManagedSheetText()).toContain("background: var(--color-surface-sunken);");
    expect(getManagedSheetText()).toContain("border-radius: 8px;");
  });

  it("overwrites old rules entirely (does not append)", () => {
    applyRules([{ selector: ".a", declarations: { color: "red" } }]);
    applyRules([{ selector: ".b", declarations: { color: "blue" } }]);
    expect(getManagedSheetText()).not.toContain(".a");
    expect(getManagedSheetText()).not.toContain("color: red;");
    expect(getManagedSheetText()).toContain(".b");
    expect(getManagedSheetText()).toContain("color: blue;");
  });

  it("does not rewrite the sheet or invalidate caches for an identical projection", () => {
    const rules: StyleRule[] = [{ selector: ".a", declarations: { color: "red" } }];
    applyRules(rules);
    const el = document.getElementById(SHEET_ID) as HTMLStyleElement;
    const sheet = el.sheet;
    const inspection = getBrowserCssInspection(document);
    const revision = inspection.inspectTokens().revision.stylesheet;

    applyRules(rules);

    expect(el.sheet).toBe(sheet);
    expect(inspection.inspectTokens().revision.stylesheet).toBe(revision);
    expect(getManagedSheetText()).toBe(".a { color: red; }");
  });

  it("does not rewrite the sheet or invalidate caches for an empty projection", () => {
    applyRules([]);
    const el = document.getElementById(SHEET_ID) as HTMLStyleElement;
    const sheet = el.sheet;
    const inspection = getBrowserCssInspection(document);
    const revision = inspection.inspectTokens().revision.stylesheet;

    applyRules([]);

    expect(el.sheet).toBe(sheet);
    expect(inspection.inspectTokens().revision.stylesheet).toBe(revision);
  });

  it("omits entries with empty property or value", () => {
    applyRules([{ selector: ".a", declarations: { "": "red", color: "" } }]);
    expect(getManagedSheetText()).not.toContain(": red");
    expect(getManagedSheetText()).not.toContain("color:");
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
        wrappers: [
          { kind: "layer", params: "theme" },
          { kind: "media", params: "(prefers-color-scheme: dark)" },
          { kind: "supports", params: "(color: oklch(0 0 0))" },
          { kind: "scope", params: "(.app)" },
        ],
      },
    }]);
    expect(css).toBe('@layer theme { @media (prefers-color-scheme: dark) { @supports (color: oklch(0 0 0)) { @scope (.app) { :root[data-theme="dark"] { --color-text: #eeeeee; } } } } }');
  });

  it("preserves nested and repeated wrappers in their authored order", () => {
    const css = rulesToCssText([{
      selector: ":root",
      declarations: { "--surface": "#111111" },
      context: {
        wrappers: [
          { kind: "media", params: "(width > 600px)" },
          { kind: "layer", params: "theme" },
          { kind: "supports", params: "(color: oklch(0 0 0))" },
          { kind: "media", params: "(prefers-contrast: more)" },
        ],
      },
    }]);

    expect(css).toBe('@media (width > 600px) { @layer theme { @supports (color: oklch(0 0 0)) { @media (prefers-contrast: more) { :root { --surface: #111111; } } } } }');
  });

  describe("canonical projection round trip", () => {
    it("replaces a rule when its value changes, without duplicating it", () => {
      const rule: StyleRule = { selector: ".a", declarations: { color: "red" } };
      applyRules([rule]);
      applyRules([{ selector: ".a", declarations: { color: "blue" } }]);
      const sheet = document.getElementById(SHEET_ID) as HTMLStyleElement;
      expect(sheet.sheet?.cssRules.length).toBe(1);
      const css = (sheet.sheet!.cssRules[0] as CSSStyleRule).style.getPropertyValue("color");
      expect(css).toBe("blue");
    });

    it("updates a custom property on a selector list containing pseudo-elements", () => {
      const rule: StyleRule = {
        selector: "*, ::before, ::after",
        declarations: { "--ring": "#abcdef" },
      };
      applyRules([rule]);
      applyRules([{ ...rule, declarations: { "--ring": "#fedcba" } }]);
      const sheet = document.getElementById(SHEET_ID) as HTMLStyleElement;
      expect(sheet.sheet?.cssRules.length).toBe(1);
      expect((sheet.sheet!.cssRules[0] as CSSStyleRule).style.getPropertyValue("--ring")).toBe("#fedcba");
    });

    it("restores a projection after the style element is reparsed", () => {
      applyRules([{ selector: "*, ::before, ::after", declarations: { "--ring": "#abcdef" } }]);
      const sheet = document.getElementById(SHEET_ID) as HTMLStyleElement;
      sheet.textContent = "*, ::before, ::after { --ring: #abcdef; }";

      applyRules([{ selector: "*, ::before, ::after", declarations: { "--ring": "#fedcba" } }]);

      expect((sheet.sheet!.cssRules[0] as CSSStyleRule).style.getPropertyValue("--ring")).toBe("#fedcba");
    });

    it("removes a rule that is no longer projected and restores it afterwards", () => {
      applyRules([
        { selector: ".a", declarations: { color: "red" } },
        { selector: ".b", declarations: { color: "blue" } },
      ]);
      let sheet = document.getElementById(SHEET_ID) as HTMLStyleElement;
      expect(sheet.sheet?.cssRules.length).toBe(2);

      applyRules([{ selector: ".a", declarations: { color: "red" } }]);
      sheet = document.getElementById(SHEET_ID) as HTMLStyleElement;
      expect(sheet.sheet?.cssRules.length).toBe(1);
      expect((sheet.sheet!.cssRules[0] as CSSStyleRule).selectorText).toBe(".a");

      applyRules([
        { selector: ".a", declarations: { color: "red" } },
        { selector: ".b", declarations: { color: "blue" } },
      ]);
      sheet = document.getElementById(SHEET_ID) as HTMLStyleElement;
      expect(sheet.sheet?.cssRules.length).toBe(2);
      expect((sheet.sheet!.cssRules[1] as CSSStyleRule).selectorText).toBe(".b");
    });

    it("keeps distinct properties of the same selector as separate rules", () => {
      applyRules([
        { selector: ".a", declarations: { color: "red" } },
        { selector: ".a", declarations: { padding: "4px" } },
      ]);
      const sheet = document.getElementById(SHEET_ID) as HTMLStyleElement;
      expect(sheet.sheet?.cssRules.length).toBe(2);
      const props = Array.from(sheet.sheet!.cssRules).map((r) => (r as CSSStyleRule).style.getPropertyValue("color") || (r as CSSStyleRule).style.getPropertyValue("padding"));
      expect(props.sort()).toEqual(["4px", "red"]);
    });

    it("keeps same-property rules when their values differ", () => {
      applyRules([
        { selector: ".a", declarations: { color: "red" } },
        { selector: ".a", declarations: { color: "blue" } },
      ]);

      const sheet = (document.getElementById(SHEET_ID) as HTMLStyleElement).sheet!;
      expect(Array.from(sheet.cssRules).map((rule) =>
        (rule as CSSStyleRule).style.getPropertyValue("color"))).toEqual(["red", "blue"]);
    });

    it("restores canonical order when an existing rule moves later", () => {
      applyRules([
        { selector: ".a", declarations: { color: "red" } },
        { selector: ".b", declarations: { color: "blue" } },
      ]);
      applyRules([
        { selector: ".b", declarations: { color: "blue" } },
        { selector: ".a", declarations: { color: "red" } },
      ]);

      const sheet = document.getElementById(SHEET_ID) as HTMLStyleElement;
      expect(Array.from(sheet.sheet!.cssRules).map((rule) => (rule as CSSStyleRule).selectorText))
        .toEqual([".b", ".a"]);
    });

    it("reappends the managed sheet to stay last in <head> when a later style element is added", async () => {
      applyRules([{ selector: ".a", declarations: { color: "red" } }]);
      const later = document.createElement("style");
      later.id = "author-style-after";
      document.head.appendChild(later);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const el = document.getElementById(SHEET_ID) as HTMLStyleElement;
      expect(el).not.toBeNull();
      expect(document.head.lastElementChild).toBe(el);
    });

    it("rehydrates live CSSOM rules after reappending the managed sheet", async () => {
      applyRules([{ selector: ".a", declarations: { color: "red" } }]);
      const later = document.createElement("style");
      document.head.appendChild(later);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const el = document.getElementById(SHEET_ID) as HTMLStyleElement;
      const rule = el.sheet?.cssRules[0] as CSSStyleRule | undefined;
      expect(el.textContent).toContain(".a { color: red; }");
      expect(rule?.selectorText).toBe(".a");
      expect(rule?.style.getPropertyValue("color")).toBe("red");
    });
  });
});

describe("escapeAttrValue", () => {
  it("escapes backslash, double-quote and closing bracket", () => {
    expect(escapeAttrValue('But]ton"')).toBe("But\\5d ton\\22 ");
    expect(escapeAttrValue("a\\b")).toBe("a\\5c b");
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

  it("round-trips a quote-containing value without allowing selector injection", () => {
    const el = document.createElement("button");
    const value = 'Button"] ~ *[data-cid="Secret';
    el.setAttribute("data-cid", value);
    document.body.appendChild(el);
    const selector = `[data-cid="${escapeAttrValue(value)}"]`;

    expect(() => document.querySelector(selector)).not.toThrow();
    expect(document.querySelector(selector)).toBe(el);
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
