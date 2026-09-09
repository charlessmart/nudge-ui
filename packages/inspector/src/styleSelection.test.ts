// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InspectionSnapshot } from "./inspection/browserCssInspection.ts";
import type { SelectedElement } from "./selectionStore.ts";
import { createStyleSelection } from "./styleSelection.ts";

function selectedElement(element: HTMLElement, line: number): SelectedElement {
  return {
    cid: "Item",
    src: `src/Item.tsx:${line}:1`,
    cprops: null,
    file: "src/Item.tsx",
    line,
    column: 1,
    domElement: element,
    componentTargets: [],
  };
}

describe("createStyleSelection", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads one computed-style view per target and preserves the selected primary", () => {
    const firstElement = document.createElement("div");
    const secondElement = document.createElement("div");
    document.body.append(firstElement, secondElement);
    const first = selectedElement(firstElement, 1);
    const second = selectedElement(secondElement, 2);
    const getComputedStyle = vi.spyOn(window, "getComputedStyle");
    const emptySnapshot = (): InspectionSnapshot => ({
      target: { status: "attached" },
      cascade: "authored",
      requestedState: "base",
      authoredState: "base",
      paintedState: "current",
      properties: [],
      availableTokens: [],
      availableStates: ["base"],
      revision: { element: 0, stylesheet: 0, tokenGeneration: "test" },
      diagnostics: [],
    });
    const snapshots = [emptySnapshot(), emptySnapshot()];

    const selection = createStyleSelection([first, second], snapshots, second);

    const width = selection?.getProperty("width");

    expect(selection?.primary).toBe(second);
    expect(width?.value).toEqual({ kind: "common", value: "" });
    expect(selection?.getProperty("width")).toBe(width);
    expect(getComputedStyle).toHaveBeenCalledTimes(2);
  });
});
