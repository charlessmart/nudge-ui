// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  appendChange,
  revertChange,
  clearChanges,
  getChangesList,
  getPendingRules,
  subscribeChanges,
} from "./changesLog.ts";
import type { ChangeRecord } from "./changesLog.ts";
import type { TokenEntry } from "virtual:design-tokens";

const COLOR_A: TokenEntry = { name: "--color-a", value: "#aaaaaa", source: "styles.css:1" };
const COLOR_B: TokenEntry = { name: "--color-b", value: "#bbbbbb", source: "styles.css:2" };
const COLOR_C: TokenEntry = { name: "--color-c", value: "#cccccc", source: "styles.css:3" };

function makeRecord(
  property: string,
  newToken: TokenEntry | null,
  oldToken: TokenEntry | null = null,
  rawValue?: string,
): ChangeRecord {
  return {
    cid: "Button",
    file: "src/Button.tsx",
    line: 1,
    selector: '[data-cid="Button"][data-src*="src/Button.tsx"]',
    property,
    oldToken,
    newToken,
    rawValue,
    source: { file: "src/Button.tsx", line: 1, component: "Button" },
  };
}

describe("changesLog", () => {
  beforeEach(() => {
    clearChanges();
    document.getElementById("design-tool-styles")?.remove();
  });
  afterEach(() => {
    clearChanges();
    document.getElementById("design-tool-styles")?.remove();
  });

  it("appendChange adds one record and getChangesList returns it", () => {
    const rec = makeRecord("background", COLOR_B, COLOR_A);
    appendChange(rec);
    expect(getChangesList()).toHaveLength(1);
    expect(getChangesList()[0]).toBe(rec);
  });

  it("subscribe fires when a change is appended", () => {
    let calls = 0;
    const unsub = subscribeChanges(() => {
      calls += 1;
    });
    appendChange(makeRecord("background", COLOR_B, COLOR_A));
    expect(calls).toBe(1);
    unsub();
  });

  it("multiple appends for different properties all show in the log", () => {
    appendChange(makeRecord("background", COLOR_B, COLOR_A));
    appendChange(makeRecord("color", COLOR_C, null));
    expect(getChangesList()).toHaveLength(2);
  });

  it("multiple appends for same property keep multiple records but getPendingRules returns one rule (last wins)", () => {
    appendChange(makeRecord("background", COLOR_B, COLOR_A));
    appendChange(makeRecord("background", COLOR_C, COLOR_B));
    expect(getChangesList()).toHaveLength(2);
    const rules = getPendingRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.declarations.background).toBe("var(--color-c)");
  });

  it("revertChange removes the change and recomposes pendingRules", () => {
    const first = makeRecord("background", COLOR_B, COLOR_A);
    const second = makeRecord("background", COLOR_C, COLOR_B);
    appendChange(first);
    appendChange(second);
    expect(getPendingRules()[0]!.declarations.background).toBe("var(--color-c)");
    revertChange(second);
    expect(getChangesList()).toHaveLength(1);
    expect(getChangesList()[0]).toBe(first);
    expect(getPendingRules()[0]!.declarations.background).toBe("var(--color-b)");
  });

  it("reverting the last change for a property leaves the sheet with no rule for that selector+property", () => {
    const rec = makeRecord("background", COLOR_B, COLOR_A);
    appendChange(rec);
    revertChange(rec);
    expect(getChangesList()).toHaveLength(0);
    expect(getPendingRules()).toHaveLength(0);
  });

  it("revertChange is a no-op when the change is not in the log", () => {
    const rec = makeRecord("background", COLOR_B, COLOR_A);
    appendChange(rec);
    const foreign = makeRecord("color", COLOR_C, null);
    revertChange(foreign);
    expect(getChangesList()).toHaveLength(1);
  });

  it("clearChanges empties the log", () => {
    appendChange(makeRecord("background", COLOR_B, COLOR_A));
    appendChange(makeRecord("color", COLOR_C, null));
    clearChanges();
    expect(getChangesList()).toHaveLength(0);
    expect(getPendingRules()).toHaveLength(0);
  });

  it("single-change revert proof: A->B, B->C, revert B->C shows A->B then revert A->B empties sheet", () => {
    const aToB = makeRecord("background", COLOR_B, COLOR_A);
    const bToC = makeRecord("background", COLOR_C, COLOR_B);
    appendChange(aToB);
    appendChange(bToC);
    expect(getPendingRules()[0]!.declarations.background).toBe("var(--color-c)");
    revertChange(bToC);
    expect(getChangesList()).toHaveLength(1);
    expect(getPendingRules()[0]!.declarations.background).toBe("var(--color-b)");
    revertChange(aToB);
    expect(getChangesList()).toHaveLength(0);
    expect(getPendingRules()).toHaveLength(0);
  });

  it("rawValue change produces a rule with the raw value", () => {
    appendChange(makeRecord("font-size", null, null, "18px"));
    const rules = getPendingRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.declarations["font-size"]).toBe("18px");
  });

  it("rebuild from log: pendingRules is a pure function of the log", () => {
    appendChange(makeRecord("padding", null, null, "10px"));
    appendChange(makeRecord("margin", null, null, "12px"));
    const before = getPendingRules();
    expect(before).toHaveLength(2);
    clearChanges();
    appendChange(makeRecord("padding", null, null, "10px"));
    appendChange(makeRecord("margin", null, null, "12px"));
    const rebuilt = getPendingRules();
    expect(rebuilt).toHaveLength(2);
    expect(rebuilt[0]!.declarations).toEqual(before[0]!.declarations);
    expect(rebuilt[1]!.declarations).toEqual(before[1]!.declarations);
  });
});
