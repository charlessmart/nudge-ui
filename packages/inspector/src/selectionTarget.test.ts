// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  resolveSelectionTarget,
  selectionTargetMode,
  trackedElementStack,
} from "./selectionTarget.ts";

function tracked(element: HTMLElement, cid: string): HTMLElement {
  element.setAttribute("data-cid", cid);
  return element;
}

describe("selection target resolution", () => {
  it("keeps the hit stack ordered from deepest to outermost", () => {
    const outer = tracked(document.createElement("div"), "Outer");
    const inner = tracked(document.createElement("span"), "Inner");
    outer.appendChild(inner);

    expect(trackedElementStack(inner)).toEqual([inner, outer]);
  });

  it("prefers the primary interactive parent for ordinary selection", () => {
    const button = tracked(document.createElement("button"), "Button");
    const label = tracked(document.createElement("span"), "ButtonLabel");
    button.appendChild(label);

    expect(resolveSelectionTarget(label)).toBe(button);
  });

  it("selects the deepest tracked element with Ctrl or Command", () => {
    const button = tracked(document.createElement("button"), "Button");
    const label = tracked(document.createElement("span"), "ButtonLabel");
    button.appendChild(label);

    expect(selectionTargetMode({ ctrlKey: true, metaKey: false, shiftKey: false })).toBe("deep");
    expect(selectionTargetMode({ ctrlKey: false, metaKey: true, shiftKey: false })).toBe("deep");
    expect(resolveSelectionTarget(label, "deep")).toBe(label);
  });

  it("keeps Command/Ctrl+Shift-click on the primary target for activation", () => {
    expect(selectionTargetMode({ ctrlKey: true, metaKey: false, shiftKey: true })).toBe("primary");
    expect(selectionTargetMode({ ctrlKey: false, metaKey: true, shiftKey: true })).toBe("primary");
  });

  it("falls back to the deepest tracked element without an interactive parent", () => {
    const outer = tracked(document.createElement("div"), "Outer");
    const inner = tracked(document.createElement("span"), "Inner");
    outer.appendChild(inner);

    expect(resolveSelectionTarget(inner)).toBe(inner);
  });
});
