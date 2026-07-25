// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  canContainElement,
  clearDomMutations,
  deleteElement,
  getDomMutations,
  getDropLocationAtPoint,
  getDropLocationForElement,
  moveElement,
  nudgeElement,
  redoDomMutation,
  undoDomMutation,
} from "./domMutations.ts";
import { resolveSelectionFromElement } from "./resolveSelection.ts";

function fixture(): { root: HTMLDivElement; first: HTMLDivElement; second: HTMLDivElement; inner: HTMLDivElement } {
  const root = document.createElement("div");
  root.innerHTML = `
    <div data-cid="Item" data-src="src/App.tsx:1:1" data-test="first">First</div>
    <div data-cid="Item" data-src="src/App.tsx:2:1" data-test="second"><div data-cid="Inner" data-src="src/App.tsx:3:1" data-test="inner">Inner</div></div>`;
  document.body.appendChild(root);
  return {
    root,
    first: root.querySelector('[data-test="first"]') as HTMLDivElement,
    second: root.querySelector('[data-test="second"]') as HTMLDivElement,
    inner: root.querySelector('[data-test="inner"]') as HTMLDivElement,
  };
}

afterEach(() => {
  clearDomMutations(true);
  document.body.replaceChildren();
});

describe("domMutations", () => {
  it("rejects an invalid block-in-span drop while accepting an ordinary div container", () => {
    const { first, second } = fixture();
    const span = document.createElement("span");
    expect(canContainElement(span, first)).toBe(false);
    expect(canContainElement(second, first)).toBe(true);
  });

  it("moves a tracked node into a legal container and makes the move undoable", () => {
    const { root, first, second } = fixture();
    const drop = getDropLocationForElement(first, second, false);
    expect(drop).not.toBeNull();
    moveElement(first, drop!);
    expect(second.lastElementChild).toBe(first);
    expect(getDomMutations()[0]).toMatchObject({ action: "move", from: { index: 0 }, to: { parentTag: "div" } });
    expect(undoDomMutation()).toBe(true);
    expect(first.parentElement).toBe(root);
    expect(redoDomMutation()).toBe(true);
    expect(second.lastElementChild).toBe(first);
  });

  it("uses the top and bottom bands of a container child as sibling insertion zones", () => {
    const { first, root, second } = fixture();
    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
    Object.defineProperty(second, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 100, width: 200, height: 100 }) as DOMRect,
    });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => second,
    });

    try {
      const before = getDropLocationAtPoint(document, first, 40, 105)!;
      const after = getDropLocationAtPoint(document, first, 40, 195)!;

      expect(before).toMatchObject({ parent: root, before: second });
      expect(after).toMatchObject({ parent: root, before: null });
    } finally {
      if (originalElementFromPoint) Object.defineProperty(document, "elementFromPoint", originalElementFromPoint);
      else delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
    }
  });

  it("uses a vertical guide and left/right sibling zones for flex rows", () => {
    const { first, root, second } = fixture();
    root.style.display = "flex";
    root.style.flexDirection = "row";
    Object.defineProperty(root, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 300, height: 120 }) as DOMRect,
    });
    Object.defineProperty(second, "getBoundingClientRect", {
      value: () => ({ left: 200, top: 0, width: 80, height: 120 }) as DOMRect,
    });
    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => second });

    try {
      const drop = getDropLocationAtPoint(document, first, 204, 60)!;
      expect(drop).toMatchObject({ parent: root, before: second, orientation: "vertical", left: 200, width: 4 });
      expect(drop.height).toBeGreaterThan(drop.width);
    } finally {
      if (originalElementFromPoint) Object.defineProperty(document, "elementFromPoint", originalElementFromPoint);
      else delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
    }
  });

  it("centres a flex-row guide in the gap when the row itself is under the pointer", () => {
    const { first, root, second } = fixture();
    root.style.display = "flex";
    root.style.flexDirection = "row";
    Object.defineProperty(root, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 300, height: 120 }) as DOMRect,
    });
    Object.defineProperty(first, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 50, height: 120 }) as DOMRect,
    });
    Object.defineProperty(second, "getBoundingClientRect", {
      value: () => ({ left: 250, top: 0, width: 50, height: 120 }) as DOMRect,
    });
    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => root });

    try {
      const drop = getDropLocationAtPoint(document, first, 130, 60)!;
      expect(drop).toMatchObject({ parent: root, before: second, orientation: "vertical", left: 150, width: 4 });
    } finally {
      if (originalElementFromPoint) Object.defineProperty(document, "elementFromPoint", originalElementFromPoint);
      else delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
    }
  });

  it("nudges siblings vertically and only accepts horizontal nudges in a flex row", () => {
    const { first, root, second } = fixture();

    expect(nudgeElement(second, "ArrowUp")).not.toBeNull();
    expect(root.firstElementChild).toBe(second);
    expect(nudgeElement(second, "ArrowRight")).toBeNull();

    root.style.display = "flex";
    root.style.flexDirection = "row";
    expect(nudgeElement(second, "ArrowRight")).not.toBeNull();
    expect(root.firstElementChild).toBe(first);
  });

  it("removes a selected tracked node and restores it on undo", () => {
    const { first, root } = fixture();
    const selected = resolveSelectionFromElement(first)!;
    deleteElement(selected);
    expect(root.querySelector('[data-test="first"]')).toBeNull();
    expect(getDomMutations()[0]).toMatchObject({ action: "delete", cid: "Item" });
    undoDomMutation();
    expect(root.querySelector('[data-test="first"]')).toBe(first);
  });
});
