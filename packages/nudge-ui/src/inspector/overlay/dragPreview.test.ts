// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { startDragPreview } from "./dragPreview.ts";
import { getDropAttemptAtPoint } from "./structuralGestures.ts";

function fixture() {
  const list = document.createElement("div");
  list.dataset.cid = "List";
  list.dataset.src = "src/App.tsx:0:1";
  list.innerHTML = `
    <div data-cid="Item" data-src="src/App.tsx:1:1" data-test="first" id="first">First</div>
    <div data-cid="Item" data-src="src/App.tsx:2:1" data-test="second">Second <b data-cid="Bold" data-src="src/App.tsx:2:9">bold</b></div>
    <div data-cid="Item" data-src="src/App.tsx:3:1" data-test="third" data-nudge-def="src/App.tsx:3:1">Third</div>`;
  document.body.append(list);
  const item = (name: string) => list.querySelector<HTMLElement>(`[data-test="${name}"]`)!;
  // Vertical list, 20px rows from y = 0.
  ["first", "second", "third"].forEach((name, index) => {
    Object.defineProperty(item(name), "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: index * 20, right: 200, bottom: index * 20 + 20, width: 200, height: 20 }) as DOMRect,
    });
  });
  Object.defineProperty(list, "getBoundingClientRect", {
    // Taller than its rows, so a pointer below the last row is inside the list rather than at its edge.
    value: () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200 }) as DOMRect,
  });
  return { list, first: item("first"), second: item("second"), third: item("third") };
}

function fixtureItem(list: HTMLElement, name: string): HTMLElement {
  return list.querySelector<HTMLElement>(`[data-test="${name}"]`)!;
}

function pointAt(element: Element): void {
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => element });
}

const placeholderOf = (root: ParentNode) => root.querySelector('[data-nudge-ui="drag-placeholder"]');
const ghostOf = (root: ParentNode) => root.querySelector('[data-nudge-ui="drag-ghost"]');

afterEach(() => {
  delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
  document.body.replaceChildren();
  document.head.replaceChildren();
});

describe("startDragPreview", () => {
  it("keeps the element's box as an invisible gap until the pointer finds a new place", () => {
    const { list, second } = fixture();
    const preview = startDragPreview(second, { x: 10, y: 30 });

    expect(second.getAttribute("data-nudge-ui-drag-source")).toBe("home");
    expect(placeholderOf(list)).toBeNull();
    const ghost = ghostOf(document.body)!;
    // Stand-ins carry no identity, so selection, layers, capture and tests never mistake them for the element.
    expect(ghost.querySelector("[data-cid], [data-src], [data-test]")).toBeNull();
    expect(ghost.hasAttribute("data-cid")).toBe(false);
    expect(ghost.hasAttribute("data-test")).toBe(false);
    expect(ghost.getAttribute("aria-hidden")).toBe("true");
    const thirdCopy = startDragPreview(fixtureItem(list, "third"), { x: 10, y: 50 });
    // Component definition markers are identity too, or a copy would be matched as the definition site.
    expect(document.querySelectorAll("[data-nudge-def]")).toHaveLength(1);
    thirdCopy.dispose();
    expect(document.querySelector("style#nudge-ui-drag-preview")?.textContent).toContain("visibility: hidden !important");
    preview.dispose();
  });

  it("carries the element's computed styles, so the copy looks the same outside its ancestors", () => {
    const style = document.createElement("style");
    style.textContent = "[data-cid='List'] b { color: rgb(1, 2, 3); }";
    document.head.append(style);
    const { second } = fixture();
    const preview = startDragPreview(second, { x: 10, y: 30 });
    const ghostBold = ghostOf(document.body)!.querySelector("b")!;
    expect(ghostBold.style.getPropertyValue("color")).toBe("rgb(1, 2, 3)");
    preview.dispose();
  });

  it("moves the slot to the drop under the pointer, so the page reflows before release", () => {
    const { list, first, second, third } = fixture();
    const preview = startDragPreview(first, { x: 10, y: 10 });
    pointAt(list);

    const attempt = preview.update({ x: 10, y: 55 });
    expect(attempt.drop).toMatchObject({ parent: list, before: null });
    expect(first.getAttribute("data-nudge-ui-drag-source")).toBe("lifted");
    expect(third.nextElementSibling).toBe(placeholderOf(list));
    // The element itself stays where it was in the DOM until the drop is recorded.
    expect(second.previousElementSibling).toBe(first);
  });

  it("never anchors a drop on its own stand-in", () => {
    const { list, first, third } = fixture();
    const preview = startDragPreview(first, { x: 10, y: 10 });
    pointAt(list);
    preview.update({ x: 10, y: 45 });
    const placeholder = placeholderOf(list)!;
    expect(placeholder.nextElementSibling).toBe(third);

    const attempt = getDropAttemptAtPoint(document, first, 10, 45);
    expect(attempt.drop?.before).toBe(third);
    preview.dispose();
  });

  it("keeps the drop while the pointer is over the slot it opened", () => {
    const { list, first, third } = fixture();
    const preview = startDragPreview(first, { x: 10, y: 10 });
    pointAt(list);
    preview.update({ x: 10, y: 55 });
    const placeholder = placeholderOf(list)!;
    Object.defineProperty(placeholder, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 40, right: 200, bottom: 60, width: 200, height: 20 }) as DOMRect,
    });
    // The reflowed layout would put this point before the third row, but it is over the slot already shown.
    pointAt(third);
    expect(preview.update({ x: 10, y: 45 }).drop).toMatchObject({ parent: list, before: null });
    expect(list.lastElementChild).toBe(placeholder);
    preview.dispose();
  });

  it("returns the slot home when there is nowhere to drop", () => {
    const { list, first, second } = fixture();
    const preview = startDragPreview(second, { x: 10, y: 30 });
    pointAt(list);
    preview.update({ x: 10, y: 55 });
    expect(list.lastElementChild).toBe(placeholderOf(list));

    pointAt(second);
    const attempt = preview.update({ x: 10, y: 30 });
    expect(attempt.drop).toBeNull();
    expect(placeholderOf(list)).toBeNull();
    expect(second.getAttribute("data-nudge-ui-drag-source")).toBe("home");
    expect(second.previousElementSibling).toBe(first);
  });

  it("finishes with the drop it showed and leaves the page as it found it", () => {
    const { list, first, second } = fixture();
    const before = list.innerHTML;
    const preview = startDragPreview(first, { x: 10, y: 10 });
    pointAt(list);
    const shown = preview.update({ x: 10, y: 55 });
    // The release lands elsewhere before another move paints; the drop on screen is still the one committed.
    pointAt(second);

    const attempt = preview.finish();
    expect(attempt).toBe(shown);
    expect(attempt.drop).toMatchObject({ parent: list, before: null });
    expect(placeholderOf(document)).toBeNull();
    expect(ghostOf(document)).toBeNull();
    expect(first.hasAttribute("data-nudge-ui-drag-source")).toBe(false);
    expect(document.querySelector("style#nudge-ui-drag-preview")).toBeNull();
    expect(list.innerHTML).toBe(before);
    preview.dispose();
  });

  it("keeps the copy under the pointer at the point it was grabbed", () => {
    const { list, second } = fixture();
    const preview = startDragPreview(second, { x: 15, y: 25 });
    pointAt(list);
    const ghost = ghostOf(document.body) as HTMLElement;
    expect(ghost.style.getPropertyValue("width")).toBe("200px");
    expect(ghost.style.getPropertyValue("height")).toBe("20px");

    const placed = [ghost.style.getPropertyValue("left"), ghost.style.getPropertyValue("top")];
    // Later moves translate the copy, which repaints it without another layout of the page.
    preview.update({ x: 115, y: 125 });
    expect(ghost.style.getPropertyValue("translate")).toBe("100px 100px");
    preview.update({ x: 125, y: 145 });
    expect(ghost.style.getPropertyValue("translate")).toBe("110px 120px");
    expect([ghost.style.getPropertyValue("left"), ghost.style.getPropertyValue("top")]).toEqual(placed);
    preview.dispose();
  });
});
