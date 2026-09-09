// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  appendChanges,
  appendChange,
  clearWorkspace,
  getChangesList,
  getPendingRules,
  isTextContentChangeValue,
  redo,
  undo,
  type TextContentChangeRecord,
} from "./changesLog.ts";
import { serializeSession } from "./canvas/sessionStore.ts";
import { generatePrompt } from "./prompt/generatePrompt.ts";

function makeTextChange(
  after: string,
  overrides: Partial<TextContentChangeRecord> = {},
): TextContentChangeRecord {
  return {
    kind: "text-content",
    id: "text-1",
    target: {
      sourceSite: { cid: "Copy", src: "src/Copy.tsx:8:3" },
      occurrence: 0,
      props: "tone:muted",
      ariaLabel: null,
      beforeText: "Original copy",
    },
    source: { file: "src/Copy.tsx", line: 8, column: 3, component: "Copy" },
    selector: '[data-cid="Copy"][data-src*="src/Copy.tsx:8:3"]',
    before: "Original copy",
    after,
    authoredAs: "literal",
    ...overrides,
  };
}

describe("text-content canonical changes", () => {
  beforeEach(() => {
    clearWorkspace();
    document.body.replaceChildren();
  });

  it("has an explicit strict type guard and cannot be mistaken for CSS", () => {
    const change = makeTextChange("Updated copy");
    expect(isTextContentChangeValue(change)).toBe(true);
    expect(isTextContentChangeValue({ ...change, property: "color" })).toBe(false);
    expect(isTextContentChangeValue({ ...change, target: { ...change.target, occurrence: -1 } })).toBe(false);

    appendChange(change);
    expect(getChangesList()).toHaveLength(1);
    expect(getPendingRules()).toEqual([]);
    expect(document.getElementById("nudge-ui-styles")?.textContent ?? "").not.toContain("Updated copy");
  });

  it("merges edits into original-to-final intent and supports undo/redo", () => {
    const first = makeTextChange("First revision");
    const second = makeTextChange("Final revision", {
      id: "text-2",
      before: "First revision",
      target: { ...first.target, occurrence: 4, beforeText: "First revision" },
    });
    appendChanges([first, second]);

    expect(getChangesList()).toMatchObject([{
      kind: "text-content",
      id: "text-1",
      before: "Original copy",
      after: "Final revision",
    }]);
    expect(undo()).toBe(true);
    expect(getChangesList()).toEqual([]);
    expect(redo()).toBe(true);
    expect(getChangesList()).toMatchObject([{ after: "Final revision" }]);

    appendChange(makeTextChange("Original copy", { id: "text-3" }));
    expect(getChangesList()).toEqual([]);
  });

  it("keeps same-source outputs with different original text separate", () => {
    const first = makeTextChange("A final", {
      id: "text-a",
      before: "A",
      target: { ...makeTextChange("ignored").target, beforeText: "A" },
    });
    const second = makeTextChange("B final", {
      id: "text-b",
      before: "B",
      target: { ...first.target, beforeText: "B" },
    });

    appendChanges([first, second]);

    expect(getChangesList()).toHaveLength(2);
    expect(getChangesList()).toMatchObject([
      { id: "text-a", before: "A", after: "A final" },
      { id: "text-b", before: "B", after: "B final" },
    ]);
  });

  it("keeps exact text-node paths separate under one safe root", () => {
    const first = makeTextChange("A final", {
      id: "text-path-a",
      before: "A",
      target: { ...makeTextChange("ignored").target, beforeText: "A", textNodePath: [0] },
    });
    const second = makeTextChange("B final", {
      id: "text-path-b",
      before: "B",
      target: { ...first.target, beforeText: "B", textNodePath: [2, 0] },
    });

    appendChanges([first, second]);

    expect(getChangesList()).toHaveLength(2);
    expect(getChangesList()).toMatchObject([
      { id: "text-path-a", target: { textNodePath: [0] } },
      { id: "text-path-b", target: { textNodePath: [2, 0] } },
    ]);
  });

  it("round-trips the durable target through the session and prompt", () => {
    appendChange(makeTextChange("Updated copy"));
    expect(serializeSession().changes).toMatchObject([{
      kind: "text-content",
      id: "text-1",
      target: {
        sourceSite: { cid: "Copy", src: "src/Copy.tsx:8:3" },
        occurrence: 0,
        beforeText: "Original copy",
      },
    }]);

    const prompt = generatePrompt(getChangesList());
    expect(prompt).toContain("## Rendered text changes");
    expect(prompt).toContain("`Original copy` → `Updated copy`");
    expect(prompt).toContain("replace the authored literal text");
    expect(prompt).not.toContain("data-cid");
  });

  it("retains selected scope and bounded semantic evidence in session and prompt", () => {
    appendChange(makeTextChange("Updated item", {
      scope: "rendered-instance",
      evidence: {
        callsiteId: "src/App.tsx:12:5",
        componentName: "Label",
        property: "text",
        mountedCount: 2,
      },
    }));

    expect(serializeSession().changes).toMatchObject([{
      kind: "text-content",
      scope: "rendered-instance",
      evidence: {
        callsiteId: "src/App.tsx:12:5",
        componentName: "Label",
        property: "text",
        mountedCount: 2,
      },
    }]);
    const prompt = generatePrompt(getChangesList());
    expect(prompt).toContain("Scope: this rendered item only");
    expect(prompt).toContain("Label.text");
    expect(prompt).toContain("2 mounted outputs");
  });
});
