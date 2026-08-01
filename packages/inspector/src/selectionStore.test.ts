// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getSelectedElement,
  setSelectedElement,
  subscribe,
  stepUp,
  stepDown,
  setHierarchyIndex,
  getHierarchy,
  getHierarchyIndex,
  type SelectedElement,
} from "./selectionStore.ts";
import { resolveSelectionFromElement } from "./resolveSelection.ts";

function makeEl(overrides: Partial<SelectedElement> = {}): SelectedElement {
  return {
    cid: "Button",
    src: "src/Button.tsx:12:5",
    cprops: "variant:primary",
    file: "src/Button.tsx",
    line: 12,
    column: 5,
    domElement: document.createElement("button"),
    componentTargets: [],
    ...overrides,
  };
}

describe("selectionStore", () => {
  beforeEach(() => {
    setSelectedElement(null);
  });
  afterEach(() => {
    setSelectedElement(null);
  });

  it("returns null initially", () => {
    expect(getSelectedElement()).toBeNull();
  });

  it("setSelectedElement stores the element", () => {
    const el = makeEl();
    setSelectedElement(el);
    expect(getSelectedElement()).toBe(el);
  });

  it("subscribe fires on change", () => {
    const calls: (SelectedElement | null)[] = [];
    const unsub = subscribe(() => {
      calls.push(getSelectedElement());
    });
    const el = makeEl({ cid: "Header" });
    setSelectedElement(el);
    setSelectedElement(null);
    expect(calls).toEqual([el, null]);
    unsub();
  });

  it("setSelectedElement(null) clears the current selection", () => {
    const el = makeEl();
    setSelectedElement(el);
    expect(getSelectedElement()).toBe(el);
    setSelectedElement(null);
    expect(getSelectedElement()).toBeNull();
  });

  it("does not notify when setting the same reference", () => {
    const el = makeEl();
    setSelectedElement(el);
    let count = 0;
    const unsub = subscribe(() => {
      count++;
    });
    setSelectedElement(el);
    expect(count).toBe(0);
    unsub();
  });

  it("short-circuits a re-resolved object with the same source-site identity", () => {
    const el = makeEl();
    setSelectedElement(el);
    let count = 0;
    const unsub = subscribe(() => {
      count++;
    });
    setSelectedElement({ ...el });
    expect(count).toBe(0);
    expect(getSelectedElement()).toBe(el);
    unsub();
  });

  it("updates when the identity changes even if the DOM element matches", () => {
    const domElement = document.createElement("button");
    const el = makeEl({ domElement });
    setSelectedElement(el);
    let count = 0;
    const unsub = subscribe(() => {
      count++;
    });
    setSelectedElement(makeEl({ domElement, cid: "Header" }));
    expect(count).toBe(1);
    expect(getSelectedElement()?.cid).toBe("Header");
    unsub();
  });
});

describe("hierarchy stepping", () => {
  let outer: HTMLDivElement;
  let mid: HTMLDivElement;
  let leaf: HTMLButtonElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    outer = document.createElement("div");
    outer.setAttribute("data-cid", "App");
    outer.setAttribute("data-src", "App.tsx:1:1");
    mid = document.createElement("div");
    mid.setAttribute("data-cid", "Card");
    mid.setAttribute("data-src", "Card.tsx:2:1");
    leaf = document.createElement("button");
    leaf.setAttribute("data-cid", "Button");
    leaf.setAttribute("data-src", "Button.tsx:3:1");
    mid.appendChild(leaf);
    outer.appendChild(mid);
    document.body.appendChild(outer);
    setSelectedElement(null);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    setSelectedElement(null);
  });

  function selectLeaf(): SelectedElement {
    const sel = resolveSelectionFromElement(leaf)!;
    setSelectedElement(sel);
    return sel;
  }

  it("computes the chain and starts at index 0", () => {
    selectLeaf();
    expect(getHierarchy()).toEqual([leaf, mid, outer]);
    expect(getHierarchyIndex()).toBe(0);
    expect(getSelectedElement()?.cid).toBe("Button");
  });

  it("stepUp moves up the chain", () => {
    selectLeaf();
    stepUp();
    expect(getHierarchyIndex()).toBe(1);
    expect(getSelectedElement()?.cid).toBe("Card");
    expect(getSelectedElement()?.domElement).toBe(mid);
    stepUp();
    expect(getHierarchyIndex()).toBe(2);
    expect(getSelectedElement()?.cid).toBe("App");
    expect(getSelectedElement()?.domElement).toBe(outer);
  });

  it("stepUp at top boundary no-ops", () => {
    selectLeaf();
    stepUp();
    stepUp();
    stepUp();
    expect(getHierarchyIndex()).toBe(2);
    expect(getSelectedElement()?.cid).toBe("App");
  });

  it("stepDown decrements the index", () => {
    selectLeaf();
    stepUp();
    stepUp();
    stepDown();
    expect(getHierarchyIndex()).toBe(1);
    expect(getSelectedElement()?.cid).toBe("Card");
  });

  it("stepDown at bottom boundary no-ops", () => {
    selectLeaf();
    stepDown();
    expect(getHierarchyIndex()).toBe(0);
    expect(getSelectedElement()?.cid).toBe("Button");
  });

  it("setHierarchyIndex jumps the selection", () => {
    selectLeaf();
    setHierarchyIndex(1);
    expect(getHierarchyIndex()).toBe(1);
    expect(getSelectedElement()?.domElement).toBe(mid);
  });

  it("selecting a new element resets the chain and index to 0", () => {
    selectLeaf();
    stepUp();
    stepUp();
    expect(getHierarchyIndex()).toBe(2);
    const newSel = resolveSelectionFromElement(leaf)!;
    setSelectedElement(newSel);
    expect(getHierarchyIndex()).toBe(0);
    expect(getHierarchy()).toEqual([leaf, mid, outer]);
    expect(getSelectedElement()?.cid).toBe("Button");
  });

  it("re-selecting the current element after stepping resets the hierarchy index", () => {
    selectLeaf();
    stepUp();
    expect(getHierarchyIndex()).toBe(1);
    expect(getSelectedElement()?.cid).toBe("Card");
    setSelectedElement(resolveSelectionFromElement(mid)!);
    expect(getHierarchyIndex()).toBe(0);
    expect(getSelectedElement()?.cid).toBe("Card");
  });

  it("notifies listeners on step", () => {
    selectLeaf();
    const indices: number[] = [];
    const unsub = subscribe(() => {
      indices.push(getHierarchyIndex());
    });
    stepUp();
    stepDown();
    expect(indices).toEqual([1, 0]);
    unsub();
  });
});
