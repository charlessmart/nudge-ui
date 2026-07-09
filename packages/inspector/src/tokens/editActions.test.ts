// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  swapToken,
  promoteToToken,
  buildSelector,
  resetPendingRules,
  getPendingRules,
  getChangeRecords,
} from "./editActions.ts";
import type { TokenEntry } from "virtual:design-tokens";

function makeButton(cid = "Button", src = "src/Button.tsx:1:1"): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.setAttribute("data-cid", cid);
  btn.setAttribute("data-src", src);
  document.body.appendChild(btn);
  return btn;
}

const COLOR_BLUE: TokenEntry = { name: "--color-blue", value: "#0000ff", source: "styles.css:1" };
const COLOR_SUNKEN: TokenEntry = { name: "--color-surface-sunken", value: "#f5f5f5", source: "styles.css:2" };
const COLOR_RAISED: TokenEntry = { name: "--color-surface-raised", value: "#ffffff", source: "styles.css:3" };
const SPACE_2: TokenEntry = { name: "--space-2", value: "8px", source: "styles.css:7" };

describe("buildSelector", () => {
  it("composes [data-cid=...][data-src*=...] from cid + file:line parsed from src", () => {
    expect(buildSelector("Button", "src/Button.tsx:42:8")).toBe(
      '[data-cid="Button"][data-src*="src/Button.tsx:42"]',
    );
  });

  it("returns null when cid is empty", () => {
    expect(buildSelector("", "src/x.tsx:1:1")).toBeNull();
  });

  it("uses the whole src as the file match when it does not match line:col", () => {
    expect(buildSelector("App", "App.tsx")).toBe('[data-cid="App"][data-src*="App.tsx"]');
  });

  it("dedupes by selector+property even across different elements on the same line", () => {
    const a = buildSelector("Button", "src/Button.tsx:1:1");
    const b = buildSelector("Button", "src/Button.tsx:1:5");
    expect(a).toBe(b);
    expect(a).toBe('[data-cid="Button"][data-src*="src/Button.tsx:1"]');
  });
});

describe("swapToken", () => {
  beforeEach(() => {
    resetPendingRules();
    document.body.innerHTML = "";
    document.getElementById("design-tool-styles")?.remove();
  });
  afterEach(() => {
    resetPendingRules();
    document.body.innerHTML = "";
    document.getElementById("design-tool-styles")?.remove();
  });

  it("writes a rule keyed by [data-cid][data-src*] mapping property to var(name)", () => {
    const btn = makeButton();
    swapToken(btn, "background", COLOR_BLUE, COLOR_RAISED);
    const sheet = document.getElementById("design-tool-styles") as HTMLStyleElement;
    expect(sheet).not.toBeNull();
    const text = sheet.textContent ?? "";
    expect(text).toContain('[data-cid="Button"][data-src*="src/Button.tsx:1"]');
    expect(text).toContain("background: var(--color-blue);");
  });

  it("recorded change record carries cid, file, selector, property, old/new token", () => {
    const btn = makeButton();
    const rec = swapToken(btn, "background", COLOR_BLUE, COLOR_RAISED);
    expect(rec).not.toBeNull();
    expect(rec!.cid).toBe("Button");
    expect(rec!.file).toBe("src/Button.tsx");
    expect(rec!.selector).toBe('[data-cid="Button"][data-src*="src/Button.tsx:1"]');
    expect(rec!.property).toBe("background");
    expect(rec!.newToken!.name).toBe("--color-blue");
    expect(rec!.oldToken?.name).toBe("--color-surface-raised");
  });

  it("called twice for the same element+property overwrites (one rule in the sheet)", () => {
    const btn = makeButton();
    swapToken(btn, "background", COLOR_BLUE, null);
    swapToken(btn, "background", COLOR_SUNKEN, COLOR_BLUE);
    const rules = getPendingRules();
    expect(rules).toHaveLength(1);
    const text = (document.getElementById("design-tool-styles") as HTMLStyleElement).textContent ?? "";
    expect(text).toContain("background: var(--color-surface-sunken);");
    expect(text).not.toContain("var(--color-blue)");
  });

  it("different properties on the same element produce two rules", () => {
    const btn = makeButton();
    swapToken(btn, "background", COLOR_BLUE, null);
    swapToken(btn, "border-radius", SPACE_2, null);
    expect(getPendingRules()).toHaveLength(2);
    const text = (document.getElementById("design-tool-styles") as HTMLStyleElement).textContent ?? "";
    expect(text).toContain("background: var(--color-blue);");
    expect(text).toContain("border-radius: var(--space-2);");
  });

  it("different elements produce independent rules", () => {
    const a = makeButton("Button", "src/Button.tsx:1:1");
    const b = makeButton("App", "src/App.tsx:5:3");
    swapToken(a, "background", COLOR_BLUE, null);
    swapToken(b, "background", COLOR_SUNKEN, null);
    expect(getPendingRules()).toHaveLength(2);
  });
});

describe("promoteToToken", () => {
  beforeEach(() => {
    resetPendingRules();
    document.body.innerHTML = "";
    document.getElementById("design-tool-styles")?.remove();
  });
  afterEach(() => {
    resetPendingRules();
    document.body.innerHTML = "";
    document.getElementById("design-tool-styles")?.remove();
  });

  it("promotes a hardcoded border-radius 8px to a token (oldToken is null)", () => {
    const btn = makeButton();
    const rec = promoteToToken(btn, "border-radius", SPACE_2);
    expect(rec).not.toBeNull();
    expect(rec!.oldToken).toBeNull();
    expect(rec!.newToken!.name).toBe("--space-2");
    const text = (document.getElementById("design-tool-styles") as HTMLStyleElement).textContent ?? "";
    expect(text).toContain("border-radius: var(--space-2);");
  });

  it("records the change in the change log with oldToken null", () => {
    const btn = makeButton();
    promoteToToken(btn, "cursor", SPACE_2);
    const recs = getChangeRecords();
    expect(recs).toHaveLength(1);
    expect(recs[0]!.oldToken).toBeNull();
    expect(recs[0]!.property).toBe("cursor");
  });
});