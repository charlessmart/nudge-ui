// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setStyle, swapToken, resetPendingRules, getPendingRules, getChangeRecords } from "../tokens/editActions.ts";
import { redo, undo } from "../changesLog.ts";
import type { TokenEntry } from "virtual:design-tokens";
import { getManagedSheetText } from "../managedStylesheet.ts";
import { resetRenderedInstanceState } from "../renderedInstance.ts";

function makeButton(cid = "Button", src = "src/Button.tsx:1:1"): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.setAttribute("data-cid", cid);
  btn.setAttribute("data-src", src);
  document.body.appendChild(btn);
  return btn;
}

const COLOR_BLUE: TokenEntry = { name: "--color-blue", value: "#0000ff", source: "styles.css:1" };

describe("setStyle", () => {
  beforeEach(() => {
    resetPendingRules();
    resetRenderedInstanceState();
    document.body.innerHTML = "";
    document.getElementById("nudge-ui-styles")?.remove();
  });
  afterEach(() => {
    resetPendingRules();
    resetRenderedInstanceState();
    document.body.innerHTML = "";
    document.getElementById("nudge-ui-styles")?.remove();
  });

  it("writes a rule keyed by [data-cid][data-src] mapping property to the raw value", () => {
    const btn = makeButton();
    setStyle(btn, "padding", "24px 8px 24px 8px");
    const text = getManagedSheetText();
    expect(text).toContain('[data-cid="Button"][data-src="src/Button.tsx:1:1"]');
    expect(text).toContain("padding: 24px 8px 24px 8px;");
  });

  it("records a ChangeRecord with rawValue and null tokens", () => {
    const btn = makeButton();
    const rec = setStyle(btn, "font-size", "18px");
    expect(rec).not.toBeNull();
    expect(rec!.cid).toBe("Button");
    expect(rec!.file).toBe("src/Button.tsx");
    expect(rec!.property).toBe("font-size");
    expect(rec!.rawValue).toBe("18px");
    expect(rec!.newToken).toBeNull();
    expect(rec!.oldToken).toBeNull();
  });

  it("records the authored source declaration for a physical preview edit", () => {
    const btn = makeButton();
    const rec = setStyle(btn, "padding-left", "24px", {
      sourceProperty: "padding-inline",
      sourceAuthoredValue: "var(--space-4)",
    });
    expect(rec?.property).toBe("padding-left");
    expect(rec?.sourceProperty).toBe("padding-inline");
    expect(rec?.sourceAuthoredValue).toBe("var(--space-4)");
  });

  it("called twice for the same element+property overwrites (one rule, latest value wins)", () => {
    const btn = makeButton();
    setStyle(btn, "padding", "10px");
    setStyle(btn, "padding", "24px 24px 24px 24px");
    expect(getPendingRules()).toHaveLength(1);
    const text = getManagedSheetText() ;
    expect(text).toContain("padding: 24px 24px 24px 24px;");
    expect(text).not.toContain("padding: 10px;");
  });

  it("different properties on the same element produce independent rules", () => {
    const btn = makeButton();
    setStyle(btn, "padding", "10px");
    setStyle(btn, "margin", "12px");
    expect(getPendingRules()).toHaveLength(2);
    const text = getManagedSheetText() ;
    expect(text).toContain("padding: 10px;");
    expect(text).toContain("margin: 12px;");
  });

  it("commits a multi-target edit as one undoable batch", () => {
    const first = makeButton("Heading", "src/Heading.tsx:1:1");
    const second = makeButton("Heading", "src/Heading.tsx:2:1");

    setStyle([first, second], "font-size", "24px");

    expect(getChangeRecords()).toHaveLength(2);
    expect(getPendingRules()).toHaveLength(2);
    expect(undo()).toBe(true);
    expect(getChangeRecords()).toHaveLength(0);
    expect(redo()).toBe(true);
    expect(getChangeRecords()).toHaveLength(2);
  });

  it("limits a partial repeated-source edit to selected rendered instances", () => {
    const first = makeButton("Heading", "src/Heading.tsx:1:1");
    const second = makeButton("Heading", "src/Heading.tsx:1:1");
    makeButton("Heading", "src/Heading.tsx:1:1");

    setStyle([first, second], "font-size", "24px");

    const records = getChangeRecords();
    expect(records).toHaveLength(2);
    expect(records.every((record) => "scope" in record && record.scope === "rendered-instance")).toBe(true);
    expect(new Set(records.map((record) => "instanceOverride" in record ? record.instanceOverride?.id : null)).size).toBe(2);
    expect(getPendingRules()).toHaveLength(2);
  });

  it("setStyle and swapToken for the same element+property share the dedup key", () => {
    const btn = makeButton();
    swapToken(btn, "color", COLOR_BLUE, null);
    setStyle(btn, "color", "#abcdef");
    expect(getPendingRules()).toHaveLength(1);
    const text = getManagedSheetText() ;
    expect(text).toContain("color: #abcdef;");
    expect(text).not.toContain("var(--color-blue)");
  });

  it("records every change in the change log", () => {
    const btn = makeButton();
    setStyle(btn, "padding", "10px");
    setStyle(btn, "margin", "12px");
    const recs = getChangeRecords();
    expect(recs.length).toBeGreaterThanOrEqual(2);
    const last = recs[recs.length - 1]!;
    expect("rawValue" in last ? last.rawValue : undefined).toBe("12px");
  });

  it("returns null when cid is absent", () => {
    const btn = document.createElement("button");
    btn.setAttribute("data-src", "src/x.tsx:1:1");
    document.body.appendChild(btn);
    expect(setStyle(btn, "padding", "10px")).toBeNull();
  });
});
