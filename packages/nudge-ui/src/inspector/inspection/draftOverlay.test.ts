// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ResolvedProperty, TokenEntry } from "../../css/model/index.ts";
import { isElementChange } from "../changes/types.ts";
import { getActiveDraftChanges } from "../drafts/store.ts";
import { setActiveStyleState } from "../shell/styleState.ts";
import { detachToken, resetPendingRules, setStyle, swapToken } from "../tokens/editActions.ts";
import { overlayDraftEdits } from "./draftOverlay.ts";

const SPACE_3: TokenEntry = { name: "--space-3", value: "12px", source: "tokens.css:3" };
const SPACE_4: TokenEntry = { name: "--space-4", value: "16px", source: "tokens.css:4" };
const SPACE_3_5: TokenEntry = { name: "--space-3-5", value: "14px", source: "tokens.css:5" };

function makeCard(src = "src/Card.tsx:1:1"): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-cid", "Card");
  el.setAttribute("data-src", src);
  document.body.appendChild(el);
  return el;
}

function linkedRow(property: string, token: TokenEntry): ResolvedProperty {
  return {
    property,
    tokenName: token.name,
    declaredValue: `var(${token.name})`,
    authored: `var(${token.name})`,
    resolvedValue: token.value,
    computed: token.value,
    capability: "atomic",
    confidence: "exact",
    evidence: { selector: ".card", sourceOrder: 3, reason: "page rule" },
  };
}

function rawRow(property: string, value: string): ResolvedProperty {
  return {
    property,
    tokenName: null,
    declaredValue: value,
    authored: value,
    resolvedValue: value,
    computed: value,
    capability: "atomic",
    confidence: "unknown",
    evidence: { selector: ".card", sourceOrder: 3, reason: "page rule" },
  };
}

function changes() {
  return getActiveDraftChanges().changes;
}

describe("overlayDraftEdits", () => {
  beforeEach(() => {
    setActiveStyleState("base");
    resetPendingRules();
    document.body.innerHTML = "";
  });
  afterEach(() => {
    setActiveStyleState("base");
    resetPendingRules();
    document.body.innerHTML = "";
  });

  it("shows a detached raw value while the page still paints the token", () => {
    const card = makeCard();
    detachToken(card, "padding-top", "14px", SPACE_4);

    const [row] = overlayDraftEdits(card, [linkedRow("padding-top", SPACE_4)], changes(), "base", [SPACE_4]);

    expect(row).toMatchObject({ property: "padding-top", tokenName: null, declaredValue: "14px", resolvedValue: "14px" });
    // What the resolver learned about where the value comes from survives the edit.
    expect(row?.evidence).toMatchObject({ selector: ".card", sourceOrder: 3, reason: "recorded edit" });
  });

  it("shows a linked token while the page still paints the raw value", () => {
    const card = makeCard();
    swapToken(card, "padding-top", SPACE_3_5, SPACE_3);

    const [row] = overlayDraftEdits(card, [linkedRow("padding-top", SPACE_3)], changes(), "base", [SPACE_3, SPACE_3_5]);

    expect(row).toMatchObject({ tokenName: SPACE_3_5.name, declaredValue: "var(--space-3-5)", resolvedValue: "14px" });
  });

  it("names a linked token the element's catalog does not list", () => {
    const card = makeCard();
    swapToken(card, "padding-top", SPACE_3_5, null);

    const [row] = overlayDraftEdits(card, [rawRow("padding-top", "12px")], changes(), "base", []);

    expect(row?.tokenName).toBe(SPACE_3_5.name);
  });

  it("leaves a row that already shows the edit as the page read it", () => {
    const card = makeCard();
    setStyle(card, "padding-top", "14px");
    const rows = [rawRow("padding-top", "14px")];

    expect(overlayDraftEdits(card, rows, changes(), "base", [])[0]).toBe(rows[0]);
  });

  it("adds a row for a property the page does not declare", () => {
    const card = makeCard();
    setStyle(card, "width", "8px");

    const rows = overlayDraftEdits(card, [], changes(), "base", []);

    expect(rows).toEqual([expect.objectContaining({ property: "width", declaredValue: "8px", tokenName: null })]);
  });

  it("splits a shorthand edit into the rows the fields read", () => {
    const card = makeCard();
    setStyle(card, "padding", "4px 8px");

    const rows = overlayDraftEdits(card, [], changes(), "base", []);

    expect(Object.fromEntries(rows.map((row) => [row.property, row.declaredValue]))).toEqual({
      "padding-top": "4px",
      "padding-right": "8px",
      "padding-bottom": "4px",
      "padding-left": "8px",
    });
  });

  it("applies only to the element and state the edit was written for", () => {
    const card = makeCard();
    const other = makeCard("src/Card.tsx:9:1");
    detachToken(card, "padding-top", "14px", SPACE_4);
    setActiveStyleState("hover");
    setStyle(card, "color", "red");
    setActiveStyleState("base");
    const rows = [linkedRow("padding-top", SPACE_4), rawRow("color", "blue")];

    expect(overlayDraftEdits(other, rows, changes(), "base", [SPACE_4])).toBe(rows);
    expect(overlayDraftEdits(card, rows, changes(), "base", [SPACE_4])[1]).toBe(rows[1]);
    expect(overlayDraftEdits(card, rows, changes(), "hover", [SPACE_4])[1]).toMatchObject({ declaredValue: "red" });
  });

  it("shows a base edit in an interaction state, except one it preserves or one edited for that state", () => {
    const card = makeCard();
    detachToken(card, "padding-top", "14px", SPACE_4);
    setStyle(card, "width", "8px");
    setActiveStyleState("hover");
    setStyle(card, "width", "10px");
    setActiveStyleState("base");
    // The page's own :focus rule sets padding, so the base edit leaves focus alone.
    const recorded = changes().map((change) =>
      isElementChange(change) && change.property === "padding-top" ? { ...change, preservedStates: ["focus" as const] } : change);
    const rows = [linkedRow("padding-top", SPACE_4), rawRow("width", "4px")];

    const hovered = overlayDraftEdits(card, rows, recorded, "hover", [SPACE_4]);
    expect(hovered[0]).toMatchObject({ declaredValue: "14px", tokenName: null });
    expect(hovered[1]).toMatchObject({ declaredValue: "10px" });
    expect(overlayDraftEdits(card, rows, recorded, "focus", [SPACE_4])[0]).toBe(rows[0]);
  });

  it("keeps an inline style, which outranks the preview and blocks the field", () => {
    const card = makeCard();
    detachToken(card, "padding-top", "14px", SPACE_4);
    const inline = { ...linkedRow("padding-top", SPACE_4), evidence: { selector: "[style]", reason: "inline" } };

    expect(overlayDraftEdits(card, [inline], changes(), "base", [SPACE_4])[0]).toBe(inline);
  });

  it("returns the page rows untouched when the draft has nothing for the element", () => {
    const card = makeCard();
    const rows = [linkedRow("padding-top", SPACE_4)];
    expect(overlayDraftEdits(card, rows, changes(), "base", [SPACE_4])).toBe(rows);
  });
});
