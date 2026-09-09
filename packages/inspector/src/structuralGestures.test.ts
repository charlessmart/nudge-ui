// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  canContainElement,
  deleteElement,
  getDropLocationAtPoint,
  getDropLocationForElement,
  moveElement,
  nudgeElement,
} from "./structuralGestures.ts";
import { resolveSelectionFromElement } from "./resolveSelection.ts";
import { clearWorkspace } from "./changesLog.ts";
import { getStructuralChanges, resetStructuralDeleteProjection } from "./structuralProjection.ts";

function fixture() {
  const root = document.createElement("div");
  root.dataset.cid = "List";
  root.dataset.src = "src/App.tsx:0:1";
  root.innerHTML = `
    <div data-cid="Item" data-src="src/App.tsx:1:1" data-test="first">First</div>
    <div data-cid="Item" data-src="src/App.tsx:2:1" data-test="second">Second</div>`;
  document.body.appendChild(root);
  return {
    root,
    first: root.querySelector('[data-test="first"]') as HTMLDivElement,
    second: root.querySelector('[data-test="second"]') as HTMLDivElement,
  };
}

afterEach(() => {
  clearWorkspace();
  resetStructuralDeleteProjection();
  document.body.replaceChildren();
});

describe("structuralGestures", () => {
  it("rejects an invalid block-in-span drop while accepting an ordinary div container", () => {
    const { first, second } = fixture();
    expect(canContainElement(document.createElement("span"), first)).toBe(false);
    expect(canContainElement(second, first)).toBe(true);
  });

  it("captures a sibling move as canonical intent and projects the host", () => {
    const { root, first, second } = fixture();
    const drop = getDropLocationForElement(second, first, true, false);
    const change = moveElement(second, drop!);
    expect(change).toMatchObject({ kind: "move", target: { sourceSite: { cid: "Item" } } });
    expect(getStructuralChanges()).toEqual([change]);
    expect(root.firstElementChild).toBe(second);
  });

  it("moves an item into an empty tracked container through the shared drop path", () => {
    const { root, first } = fixture();
    const destination = document.createElement("aside");
    destination.dataset.cid = "EmptyDestination";
    destination.dataset.src = "src/App.tsx:10:1";
    document.body.append(destination);

    const drop = getDropLocationForElement(first, destination, true, true);
    expect(drop).toMatchObject({ parent: destination, before: null });
    const change = moveElement(first, drop!);

    expect(change).toMatchObject({
      source: { parent: { sourceSite: { cid: "List" } } },
      destination: { parent: { sourceSite: { cid: "EmptyDestination" } }, before: null },
    });
    expect(root.querySelector('[data-test="first"]')).toBeNull();
    expect(destination.firstElementChild).toBe(first);
  });

  it("accepts a drop after an element when whitespace follows it", () => {
    const { root, first, second } = fixture();
    const drop = getDropLocationForElement(first, second, false, false);

    expect(drop).toMatchObject({ parent: root, before: null });
    expect(moveElement(first, drop!)).not.toBeNull();
    expect(root.lastElementChild).toBe(first);
  });

  it("uses container edge bands as sibling insertion zones", () => {
    const { first, root, second } = fixture();
    const original = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
    Object.defineProperty(second, "getBoundingClientRect", { value: () => ({ left: 0, top: 100, width: 200, height: 100 }) as DOMRect });
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => second });
    try {
      expect(getDropLocationAtPoint(document, first, 40, 105)).toBeNull();
      expect(getDropLocationAtPoint(document, first, 40, 195)).toMatchObject({ parent: root, before: null });
    } finally {
      if (original) Object.defineProperty(document, "elementFromPoint", original);
      else delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
    }
  });

  it("uses a vertical guide for flex-row insertion", () => {
    const { first, root, second } = fixture();
    root.style.display = "flex";
    root.style.flexDirection = "row";
    Object.defineProperty(root, "getBoundingClientRect", { value: () => ({ left: 0, top: 0, width: 300, height: 120 }) as DOMRect });
    Object.defineProperty(second, "getBoundingClientRect", { value: () => ({ left: 200, top: 0, width: 80, height: 120 }) as DOMRect });
    const original = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => second });
    try {
      expect(getDropLocationAtPoint(document, first, 260, 60)).toMatchObject({ parent: root, before: null, orientation: "vertical", left: 280, width: 4 });
    } finally {
      if (original) Object.defineProperty(document, "elementFromPoint", original);
      else delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
    }
  });

  it("fails closed for wrapped flex-row containers", () => {
    const { first, root, second } = fixture();
    root.style.display = "flex";
    root.style.flexDirection = "row";
    root.style.flexWrap = "wrap";

    expect(getDropLocationForElement(second, first, true, false)).toBeNull();
  });

  it("nudges only valid sibling directions into canonical moves", () => {
    const { first, root, second } = fixture();
    expect(nudgeElement(second, "ArrowUp")).not.toBeNull();
    expect(root.firstElementChild).toBe(second);
    expect(nudgeElement(second, "ArrowRight")).toBeNull();
    root.style.display = "flex";
    root.style.flexDirection = "row";
    expect(nudgeElement(second, "ArrowRight")).not.toBeNull();
    expect(root.firstElementChild).toBe(first);
  });

  it("captures delete intent and projects it through the host adapter", () => {
    const { first, root } = fixture();
    const change = deleteElement(resolveSelectionFromElement(first)!);
    expect(change).toMatchObject({ kind: "delete", target: { sourceSite: { cid: "Item" } } });
    expect(getStructuralChanges()).toEqual([change]);
    expect(root.querySelector('[data-test="first"]')).toBeNull();
  });

  it("does not directly project a Canvas-document delete before its renderer message", () => {
    const frameDocument = document.implementation.createHTMLDocument("Canvas frame");
    const root = frameDocument.createElement("div");
    root.dataset.cid = "List";
    root.dataset.src = "src/App.tsx:0:1";
    const target = frameDocument.createElement("div");
    target.dataset.cid = "Item";
    target.dataset.src = "src/App.tsx:1:1";
    root.append(target);
    frameDocument.body.append(root);
    expect(deleteElement(resolveSelectionFromElement(target)!)).not.toBeNull();
    expect(target.isConnected).toBe(true);
  });
});
