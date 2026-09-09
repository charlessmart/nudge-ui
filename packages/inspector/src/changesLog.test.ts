// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  appendChange,
  appendChanges,
  revertChange,
  reconcileVerifiedChanges,
  clearWorkspace,
  getChangesList,
  getPendingRules,
  subscribeChanges,
  undo,
  redo,
} from "./changesLog.ts";
import type { ChangeRecord, ComponentChangeRecord, ElementChangeRecord } from "./changesLog.ts";
import type { TokenEntry } from "virtual:design-tokens";
import { makeComponentChange } from "./changes/_testUtils.ts";
import { changeKey } from "./changes/model.ts";
import { setSelectedElement } from "./selectionStore.ts";
import type { RenderedInstanceOverride } from "./renderedInstance.ts";

const COLOR_A: TokenEntry = { name: "--color-a", value: "#aaaaaa", source: "styles.css:1" };
const COLOR_B: TokenEntry = { name: "--color-b", value: "#bbbbbb", source: "styles.css:2" };
const COLOR_C: TokenEntry = { name: "--color-c", value: "#cccccc", source: "styles.css:3" };

function makeRecord(
  property: string,
  newToken: TokenEntry | null,
  oldToken: TokenEntry | null = null,
  rawValue?: string,
): ElementChangeRecord {
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

function makeComponentRecord(
  afterValue: "primary" | "secondary",
  beforeValue: "primary" | "secondary" = "primary",
): ComponentChangeRecord {
  return makeComponentChange({
    before: { kind: "value", value: beforeValue },
    after: afterValue,
  });
}

function makeInstanceOverride(): RenderedInstanceOverride {
  return {
    id: "override-1",
    target: {
      sourceSite: { cid: "Button", src: "src/Button.tsx:1:1" },
      locator: { kind: "evidence", occurrence: 1, props: null, text: "Two" },
    },
  };
}

describe("changesLog", () => {
  beforeEach(() => {
    clearWorkspace();
    document.getElementById("nudge-ui-styles")?.remove();
  });
  afterEach(() => {
    clearWorkspace();
    document.getElementById("nudge-ui-styles")?.remove();
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

  it("keeps component prop intent canonical without emitting a CSS rule", () => {
    appendChange(makeComponentRecord("secondary"));
    appendChange(makeComponentRecord("primary", "secondary"));
    expect(getChangesList()).toEqual([]);
    expect(getPendingRules()).toEqual([]);

    appendChange(makeComponentRecord("secondary"));
    expect(getChangesList()).toMatchObject([{
      kind: "component-prop",
      before: { kind: "value", value: "primary" },
      after: "secondary",
    }]);
    expect(getPendingRules()).toEqual([]);
    expect(undo()).toBe(true);
    expect(getChangesList()).toEqual([]);
    expect(redo()).toBe(true);
    expect(getChangesList()).toHaveLength(1);
  });

  it("retains repeated scope evidence when a component change is edited again", () => {
    appendChange(makeComponentChange({
      after: "secondary",
      scope: "source-site",
      evidence: {
        occurrence: 0,
        props: null,
        ariaLabel: null,
        beforeText: "primary",
        mountedCount: 2,
      },
    }));
    appendChange(makeComponentChange({
      before: { kind: "value", value: "secondary" },
      after: "final",
    }));

    expect(getChangesList()).toMatchObject([{
      kind: "component-prop",
      after: "final",
      scope: "source-site",
      evidence: { mountedCount: 2 },
    }]);
  });

  it("appends a declaration batch as one undoable history entry", () => {
    appendChanges([
      makeRecord("left", null, null, "auto"),
      makeRecord("right", null, null, "32px"),
    ]);
    expect(getChangesList()).toHaveLength(2);
    expect(getPendingRules().flatMap((rule) => Object.entries(rule.declarations))).toEqual([
      ["left", "auto"],
      ["right", "32px"],
    ]);
    expect(undo()).toBe(true);
    expect(getChangesList()).toHaveLength(0);
    expect(redo()).toBe(true);
    expect(getChangesList()).toHaveLength(2);
  });

  it("multiple appends for same property preserve the first baseline and latest value as one delta", () => {
    appendChange(makeRecord("background", COLOR_B, COLOR_A));
    appendChange(makeRecord("background", COLOR_C, COLOR_B));
    expect(getChangesList()).toHaveLength(1);
    const change = getChangesList()[0] as ElementChangeRecord;
    expect(change.oldToken).toBe(COLOR_A);
    expect(change.newToken).toBe(COLOR_C);
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

  it("clearWorkspace empties the log", () => {
    appendChange(makeRecord("background", COLOR_B, COLOR_A));
    appendChange(makeRecord("color", COLOR_C, null));
    clearWorkspace();
    expect(getChangesList()).toHaveLength(0);
    expect(getPendingRules()).toHaveLength(0);
  });

  it("reconcileVerifiedChanges removes only verified records and undo cannot restore them", () => {
    const verified = makeRecord("background", COLOR_B, COLOR_A);
    const unsent = makeRecord("color", COLOR_C, COLOR_A);
    appendChange(verified);
    appendChange(unsent);

    expect(reconcileVerifiedChanges(new Set([changeKey(verified)]))).toBe(1);
    expect(getChangesList()).toMatchObject([{ property: "color" }]);

    expect(undo()).toBe(true);
    expect(getChangesList()).toEqual([]);
    expect(redo()).toBe(true);
    expect(getChangesList()).toMatchObject([{ property: "color" }]);
  });



  it("rawValue change produces a rule with the raw value", () => {
    appendChange(makeRecord("font-size", null, null, "18px"));
    const rules = getPendingRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.declarations["font-size"]).toBe("18px");
  });

  it("does not create another undo step for an identical effective edit", () => {
    const rec = makeRecord("font-size", null, null, "18px");
    appendChange(makeRecord("color", COLOR_B, COLOR_A));
    appendChange(rec);
    appendChange({ ...rec });

    expect(getChangesList()).toHaveLength(2);
    expect(undo()).toBe(true);
    expect(getChangesList()).toHaveLength(1);
    expect(redo()).toBe(true);
    expect(getChangesList()).toHaveLength(2);
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

    it("clearWorkspace clears the undo stack", () => {
      appendChange(makeRecord("background", COLOR_B, COLOR_A));
      appendChange(makeRecord("color", COLOR_C, null));
      undo();
      clearWorkspace();
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
    clearWorkspace();
    appendChange(makeRecord("padding", null, null, "10px"));
    appendChange(makeRecord("margin", null, null, "12px"));
    const rebuilt = getPendingRules();
    expect(rebuilt).toHaveLength(2);
    expect(rebuilt[0]!.declarations).toEqual(before[0]!.declarations);
    expect(rebuilt[1]!.declarations).toEqual(before[1]!.declarations);
  });

  it("deferred delta verification: a commit does not probe synchronously, and the result lands on the next pass", async () => {
    const btn = document.createElement("button");
    btn.setAttribute("data-cid", "Button");
    btn.setAttribute("data-src", "src/Button.tsx:1:1");
    document.body.appendChild(btn);

    appendChange(makeRecord("background", COLOR_B, COLOR_A));
    const afterCommit = getChangesList()[0] as ElementChangeRecord;
    // The commit handler returns before any querySelectorAll/probe work runs.
    expect(afterCommit.previewResult).toBeUndefined();

    await new Promise((resolve) => setTimeout(resolve, 40));
    await new Promise((resolve) => setTimeout(resolve, 40));
    const verified = getChangesList()[0] as ElementChangeRecord;
    expect(verified.previewResult).toBeDefined();
    expect(verified.previewResult!.status).toBe("applied");
    btn.remove();
  });

  it("deferred verification stays bound to the document selected at commit time", async () => {
    const hostButton = document.createElement("button");
    hostButton.setAttribute("data-cid", "Button");
    hostButton.setAttribute("data-src", "src/Button.tsx:1:1");
    document.body.appendChild(hostButton);
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const frameButton = iframe.contentDocument!.createElement("button");
    frameButton.setAttribute("data-cid", "Button");
    frameButton.setAttribute("data-src", "src/Button.tsx:1:1");
    iframe.contentDocument!.body.appendChild(frameButton);

    const selected = (domElement: HTMLElement) => ({
      cid: "Button",
      src: "src/Button.tsx:1:1",
      cprops: null,
      file: "src/Button.tsx",
      line: 1,
      column: 1,
      domElement,
      componentTargets: [],
    });
    setSelectedElement(selected(hostButton));
    appendChange(makeRecord("background", COLOR_B, COLOR_A));
    // Simulate a user switching to Canvas before the deferred idle pass.
    setSelectedElement(selected(frameButton));

    await new Promise((resolve) => setTimeout(resolve, 80));
    const verified = getChangesList()[0] as ElementChangeRecord;
    expect(verified.previewResult?.status).toBe("applied");

    setSelectedElement(null);
    hostButton.remove();
    iframe.remove();
  });

  it("returning to the original baseline removes the canonical delta", () => {
    appendChange(makeRecord("background", COLOR_B, COLOR_A));
    appendChange(makeRecord("background", COLOR_A, COLOR_B));
    expect(getChangesList()).toHaveLength(0);
    expect(getPendingRules()).toHaveLength(0);
  });

  it("keeps different source lines distinct", () => {
    const lineTwo = { ...makeRecord("color", COLOR_B, COLOR_A), line: 2, source: { file: "src/Button.tsx", line: 2, component: "Button" } };
    const lineThree = { ...makeRecord("color", COLOR_C, COLOR_A), line: 3, source: { file: "src/Button.tsx", line: 3, component: "Button" } };
    appendChange(lineTwo);
    appendChange(lineThree);
    expect(getChangesList()).toHaveLength(2);
  });

  it("emits an individual rule after the source-site default", () => {
    document.body.innerHTML = `
      <button data-cid="Button" data-src="src/Button.tsx:1:1">One</button>
      <button data-cid="Button" data-src="src/Button.tsx:1:1">Two</button>`;
    const source = { ...makeRecord("color", null, null, "red"), selector: '[data-cid="Button"][data-src="src/Button.tsx:1:1"]' };
    const instance = {
      ...makeRecord("color", null, null, "blue"),
      selector: source.selector,
      scope: "rendered-instance" as const,
      instanceOverride: makeInstanceOverride(),
    };
    appendChange(source);
    appendChange(instance);
    const rules = getPendingRules();
    expect(rules).toHaveLength(2);
    expect(rules[0]!.declarations.color).toBe("red");
    expect(rules[1]!.selector).toContain('data-projection-instance="override-1"');
    expect(rules[1]!.declarations.color).toBe("blue");
  });

  it("clearWorkspace also empties the managed stylesheet", () => {
    appendChange(makeRecord("color", null, null, "red"));
    clearWorkspace();
    expect(document.getElementById("nudge-ui-styles")?.textContent).toBe("");
  });

  it("stores global token changes without element identity and preserves their context", () => {
    appendChange({
      kind: "token",
      tokenName: "--color-text",
      file: "src/theme.css",
      line: 6,
      selector: ':root[data-theme="dark"]',
      property: "--color-text",
      rawValue: "#eeeeee",
      oldRawValue: "#dddddd",
      context: { wrappers: [{ kind: "media", params: "(prefers-color-scheme: dark)" }] },
      contextLabel: 'root[data-theme="dark"]',
      source: { file: "src/theme.css", line: 6, component: "Global token" },
    });

    expect(getChangesList()[0]).not.toHaveProperty("cid");
    expect(getPendingRules()).toEqual([{
      selector: ':root[data-theme="dark"]',
      declarations: { "--color-text": "#eeeeee" },
      context: { wrappers: [{ kind: "media", params: "(prefers-color-scheme: dark)" }] },
    }]);
  });

  it("deduplicates global token edits against the first authored baseline", () => {
    const base = {
      kind: "token" as const,
      tokenName: "--space-2",
      file: "src/theme.css",
      line: 3,
      selector: ":root",
      property: "--space-2",
      context: {},
      contextLabel: "Default",
      source: { file: "src/theme.css", line: 3, component: "Global token" as const },
    };
    appendChange({ ...base, oldRawValue: "8px", rawValue: "10px" });
    appendChange({ ...base, oldRawValue: "10px", rawValue: "12px" });
    expect(getChangesList()).toHaveLength(1);
    expect(getChangesList()[0]).toMatchObject({ oldRawValue: "8px", rawValue: "12px" });
    appendChange({ ...base, oldRawValue: "12px", rawValue: "8px" });
    expect(getChangesList()).toHaveLength(0);
  });
});
