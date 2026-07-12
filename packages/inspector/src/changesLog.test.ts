// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  appendChange,
  revertChange,
  clearChanges,
  getChangesList,
  getPendingRules,
  subscribeChanges,
  undo,
  redo,
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
    selector: '[data-cid="Button"][data-src*="src/Button.tsx:1"]',
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
    expect(getChangesList()[0]).toMatchObject(rec);
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

  it("multiple appends for same property preserve the first baseline and latest value as one delta", () => {
    appendChange(makeRecord("background", COLOR_B, COLOR_A));
    appendChange(makeRecord("background", COLOR_C, COLOR_B));
    expect(getChangesList()).toHaveLength(1);
    expect(getChangesList()[0]!.oldToken).toBe(COLOR_A);
    expect(getChangesList()[0]!.newToken).toBe(COLOR_C);
    const rules = getPendingRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.declarations.background).toBe("var(--color-c)");
  });

  it("revertChange removes the canonical delta", () => {
    const first = makeRecord("background", COLOR_B, COLOR_A);
    const second = makeRecord("background", COLOR_C, COLOR_B);
    appendChange(first);
    appendChange(second);
    expect(getPendingRules()[0]!.declarations.background).toBe("var(--color-c)");
    revertChange(second);
    expect(getChangesList()).toHaveLength(0);
    expect(getPendingRules()).toHaveLength(0);
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

  it("single-change revert clears the full baseline-to-current delta", () => {
    const aToB = makeRecord("background", COLOR_B, COLOR_A);
    const bToC = makeRecord("background", COLOR_C, COLOR_B);
    appendChange(aToB);
    appendChange(bToC);
    expect(getPendingRules()[0]!.declarations.background).toBe("var(--color-c)");
    revertChange(bToC);
    expect(getChangesList()).toHaveLength(0);
    expect(getPendingRules()).toHaveLength(0);
  });

  it("rawValue change produces a rule with the raw value", () => {
    appendChange(makeRecord("font-size", null, null, "18px"));
    const rules = getPendingRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.declarations["font-size"]).toBe("18px");
  });

  describe("undo / redo", () => {
    it("undo returns false when the log is empty", () => {
      expect(undo()).toBe(false);
    });

    it("undo pops the last change and redo restores it", () => {
      const first = makeRecord("background", COLOR_B, COLOR_A);
      const second = makeRecord("color", COLOR_C, null);
      appendChange(first);
      appendChange(second);
      expect(getChangesList()).toHaveLength(2);

      undo();
      expect(getChangesList()).toHaveLength(1);
      expect(getChangesList()[0]).toMatchObject(first);
      expect(getPendingRules()).toHaveLength(1);

      redo();
      expect(getChangesList()).toHaveLength(2);
      expect(getChangesList()[1]).toMatchObject(second);
      expect(getPendingRules()).toHaveLength(2);
    });

    it("redo returns false when the undo stack is empty", () => {
      expect(redo()).toBe(false);
    });

    it("new appendChange clears the redo stack", () => {
      appendChange(makeRecord("background", COLOR_B, COLOR_A));
      appendChange(makeRecord("color", COLOR_C, null));
      undo();
      expect(redo()).toBe(true);

      appendChange(makeRecord("padding", null, null, "16px"));
      expect(redo()).toBe(false);
    });

    it("revertChange clears the redo stack", () => {
      const first = makeRecord("background", COLOR_B, COLOR_A);
      const second = makeRecord("color", COLOR_C, null);
      appendChange(first);
      appendChange(second);
      undo();
      expect(getChangesList()).toHaveLength(1);

      revertChange(first);
      expect(getChangesList()).toHaveLength(0);
      expect(redo()).toBe(false);
    });

    it("clearChanges clears the undo stack", () => {
      appendChange(makeRecord("background", COLOR_B, COLOR_A));
      appendChange(makeRecord("color", COLOR_C, null));
      undo();
      clearChanges();
      expect(redo()).toBe(false);
    });

    it("multiple undos and redos maintain correct state", () => {
      const a = makeRecord("background", COLOR_B, COLOR_A);
      const b = makeRecord("color", COLOR_C, null);
      const c = makeRecord("padding", null, null, "16px");
      appendChange(a);
      appendChange(b);
      appendChange(c);
      expect(getChangesList()).toHaveLength(3);

      undo();
      expect(getChangesList()).toHaveLength(2);
      undo();
      expect(getChangesList()).toHaveLength(1);
      undo();
      expect(getChangesList()).toHaveLength(0);
      expect(undo()).toBe(false);

      redo();
      expect(getChangesList()).toHaveLength(1);
      expect(getChangesList()[0]).toMatchObject(a);
      redo();
      expect(getChangesList()).toHaveLength(2);
      redo();
      expect(getChangesList()).toHaveLength(3);
      expect(redo()).toBe(false);
    });

    it("undo/redo preserves stylesheet integrity (last write wins)", () => {
      appendChange(makeRecord("background", COLOR_B, COLOR_A));
      appendChange(makeRecord("background", COLOR_C, COLOR_B));
      expect(getPendingRules()[0]!.declarations.background).toBe("var(--color-c)");

      undo();
      expect(getPendingRules()[0]!.declarations.background).toBe("var(--color-b)");

      redo();
      expect(getPendingRules()[0]!.declarations.background).toBe("var(--color-c)");
    });
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

  it("returning to the original baseline removes the canonical delta", () => {
    appendChange(makeRecord("background", COLOR_B, COLOR_A));
    appendChange(makeRecord("background", COLOR_A, COLOR_B));
    expect(getChangesList()).toHaveLength(0);
    expect(getPendingRules()).toHaveLength(0);
  });

  it("keeps different source lines and scopes distinct", () => {
    const lineTwo = { ...makeRecord("color", COLOR_B, COLOR_A), line: 2, source: { file: "src/Button.tsx", line: 2, component: "Button" } };
    const instance = { ...makeRecord("color", COLOR_C, COLOR_A), scope: "instance-preview" as const, selector: '[data-dt-instance="one"]' };
    appendChange(lineTwo);
    appendChange(instance);
    expect(getChangesList()).toHaveLength(2);
  });

  it("clearChanges also empties the managed stylesheet", () => {
    appendChange(makeRecord("color", null, null, "red"));
    clearChanges();
    expect(document.getElementById("design-tool-styles")?.textContent).toBe("");
  });
});
