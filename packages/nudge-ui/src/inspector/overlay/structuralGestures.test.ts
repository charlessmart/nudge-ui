// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  canContainElement,
  deleteElement,
  dropTargetRect,
  getDropAttemptAtPoint,
  getDropLocationAtPoint,
  moveElement,
  nudgeElement,
  type DropLocation,
} from "./structuralGestures.ts";
import { resolveSelectionFromElement } from "../selection/resolveSelection.ts";
import { clearActiveDraft } from "../drafts/store.ts";
import { getStructuralChangeDiagnostics, getStructuralChanges, resetStructuralDeleteProjection } from "../projection/structuralProjection.ts";

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

/** A drop at an explicit position; recording a move ignores the guide's geometry. */
function dropAt(parent: HTMLElement, before: Element | null): DropLocation {
  return { parent, before, orientation: "horizontal", left: 0, top: 0, width: 0, height: 0 };
}

function withElementFromPoint<T>(element: Element, run: () => T): T {
  const original = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => element });
  try {
    return run();
  } finally {
    if (original) Object.defineProperty(document, "elementFromPoint", original);
    else delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
  }
}

afterEach(() => {
  document.documentElement.removeAttribute("data-nudge-ui-editor");
  clearActiveDraft();
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
    const change = moveElement(second, dropAt(root, first));
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
    Object.defineProperty(destination, "getBoundingClientRect", { value: () => ({ left: 0, top: 100, width: 200, height: 100 }) as DOMRect });

    const drop = withElementFromPoint(destination, () => getDropLocationAtPoint(document, first, 100, 150));
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
    Object.defineProperty(second, "getBoundingClientRect", { value: () => ({ left: 0, top: 100, width: 200, height: 100 }) as DOMRect });
    const drop = withElementFromPoint(second, () => getDropLocationAtPoint(document, first, 100, 195));

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

  describe("display: contents parents", () => {
    // A, Wrapper(B, C), D laid out as one row or column; the wrapper has no box, so B and C belong to the outer layout.
    function contentsFixture(direction: "row" | "column") {
      const tracked = (cid: string, line: number, text = "") => {
        const element = document.createElement("div");
        element.dataset.cid = cid;
        element.dataset.src = `src/App.tsx:${line}:1`;
        element.textContent = text;
        return element;
      };
      const boxAt = (element: HTMLElement, index: number) => {
        const [left, top] = direction === "row" ? [index * 110, 0] : [0, index * 60];
        Object.defineProperty(element, "getBoundingClientRect", {
          value: () => ({ left, top, width: 100, height: 50, right: left + 100, bottom: top + 50 }) as DOMRect,
        });
      };
      const root = tracked("Layout", 0);
      if (direction === "row") Object.assign(root.style, { display: "flex", flexDirection: "row" });
      Object.defineProperty(root, "getBoundingClientRect", {
        value: () => (direction === "row"
          ? { left: 0, top: 0, width: 430, height: 50, right: 430, bottom: 50 }
          : { left: 0, top: 0, width: 100, height: 230, right: 100, bottom: 230 }) as DOMRect,
      });
      const wrapper = tracked("Box", 1);
      wrapper.style.display = "contents";
      const [a, b, c, d] = ["a", "b", "c", "d"].map((name, index) => tracked("Item", index + 2, name));
      [a, b, c, d].forEach((item, index) => boxAt(item!, index));
      wrapper.append(b!, c!);
      const dragged = tracked("Dragged", 9);
      root.append(a!, wrapper, d!, dragged);
      document.body.append(root);
      return { root, wrapper, a: a!, b: b!, c: c!, d: d!, dragged };
    }

    it("outlines the span of its children because it has no box of its own", () => {
      const { wrapper } = contentsFixture("row");
      expect(dropTargetRect(wrapper)).toMatchObject({ left: 110, top: 0, width: 210, height: 50 });
    });

    it("drops beside a hovered child using the outer block layout", () => {
      const { wrapper, c, dragged } = contentsFixture("column");
      expect(withElementFromPoint(c, () => getDropLocationAtPoint(document, dragged, 50, 125))).toMatchObject({
        parent: wrapper, before: c, orientation: "horizontal", top: 120,
      });
    });

    it("snaps to a gap between its children in an outer flex row", () => {
      const { root, wrapper, c, dragged } = contentsFixture("row");
      expect(withElementFromPoint(root, () => getDropLocationAtPoint(document, dragged, 215, 25))).toMatchObject({
        parent: wrapper, before: c, orientation: "vertical", left: 215,
      });
    });

    it("draws a vertical guide beside a hovered child in an outer flex row", () => {
      const { wrapper, b, c, dragged } = contentsFixture("row");
      expect(withElementFromPoint(b, () => getDropLocationAtPoint(document, dragged, 190, 25))).toMatchObject({
        parent: wrapper, before: c, orientation: "vertical",
      });
    });
  });

  describe("wrapped flex rows", () => {
    // Two lines: A B / C D, 100px items with 10px gaps. The dragged item has no box, so it joins no line.
    function wrappedFixture() {
      const root = document.createElement("div");
      root.dataset.cid = "Row";
      root.dataset.src = "src/App.tsx:0:1";
      Object.assign(root.style, { display: "flex", flexDirection: "row", flexWrap: "wrap" });
      const boxes = { a: [0, 0], b: [110, 0], c: [0, 60], d: [110, 60] } as const;
      const items = Object.fromEntries(Object.entries(boxes).map(([name, [left, top]], index) => {
        const item = document.createElement("div");
        item.dataset.cid = "Item";
        item.dataset.src = `src/App.tsx:${index + 1}:1`;
        item.textContent = name;
        Object.defineProperty(item, "getBoundingClientRect", {
          value: () => ({ left, top, width: 100, height: 50, right: left + 100, bottom: top + 50 }) as DOMRect,
        });
        root.append(item);
        return [name, item];
      })) as Record<keyof typeof boxes, HTMLDivElement>;
      const dragged = document.createElement("div");
      dragged.dataset.cid = "Dragged";
      dragged.dataset.src = "src/App.tsx:9:1";
      root.append(dragged);
      Object.defineProperty(root, "getBoundingClientRect", {
        value: () => ({ left: 0, top: 0, width: 300, height: 110, right: 300, bottom: 110 }) as DOMRect,
      });
      document.body.append(root);
      return { root, dragged, ...items };
    }

    it("snaps to the gap on the line under the cursor", () => {
      const { root, dragged, d } = wrappedFixture();
      expect(withElementFromPoint(root, () => getDropLocationAtPoint(document, dragged, 105, 85))).toMatchObject({
        parent: root, before: d, orientation: "vertical", left: 105, top: 60, height: 50,
      });
    });

    it("places a drop past the end of a line after that line's last item", () => {
      const { root, dragged, c } = wrappedFixture();
      expect(withElementFromPoint(root, () => getDropLocationAtPoint(document, dragged, 250, 25))).toMatchObject({
        parent: root, before: c, left: 210, top: 0, height: 50,
      });
    });

    it("draws the guide beside a hovered line-end item rather than at the next line's start", () => {
      const { root, dragged, b, c } = wrappedFixture();
      expect(withElementFromPoint(b, () => getDropLocationAtPoint(document, dragged, 195, 25))).toMatchObject({
        parent: root, before: c, left: 210, top: 0, height: 50,
      });
    });

    it("drops into a hovered item when the pointer is away from its edges", () => {
      const { dragged, b } = wrappedFixture();
      expect(withElementFromPoint(b, () => getDropLocationAtPoint(document, dragged, 160, 25))).toMatchObject({
        parent: b, before: null,
      });
    });

    it("lets keyboard nudges reorder items", () => {
      const { root, a, b } = wrappedFixture();
      expect(nudgeElement(a, "ArrowRight")).not.toBeNull();
      expect(root.firstElementChild).toBe(b);
    });
  });

  describe("a column stack inside a flex-row shell", () => {
    // The voice library modal: a row of sidebar and main pane, and in the pane a 5x Stack holding a back button,
    // a 3x Stack of form fields, and the previews. Stacks are column flex boxes with a row gap.
    function voiceModalFixture() {
      const boxed = (cid: string, [left, top, width, height]: readonly [number, number, number, number], style = "", tag = "div") => {
        const element = document.createElement(tag);
        element.dataset.cid = cid;
        element.dataset.src = `src/CreateVoicePage.tsx:${cid}`;
        element.setAttribute("style", style);
        Object.defineProperty(element, "getBoundingClientRect", {
          value: () => ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect,
        });
        return element;
      };
      const column = "display: flex; flex-direction: column; flex-wrap: nowrap";
      const shell = boxed("Box", [0, 0, 900, 600], "display: flex");
      const sidebar = boxed("Stack", [0, 0, 220, 600], column);
      const pane = boxed("Box", [220, 0, 680, 600], column);
      const scroll = boxed("Box", [220, 0, 680, 600]);
      const cap = boxed("Box", [236, 16, 480, 320]);
      const outer = boxed("Stack", [236, 16, 480, 320], column);
      const backBox = boxed("Box", [236, 16, 480, 40]);
      const back = boxed("IconButton", [236, 16, 40, 40], "", "button");
      const form = boxed("Stack", [236, 76, 480, 200], column);
      const name = boxed("TextField", [236, 76, 480, 60]);
      const description = boxed("TextArea", [236, 148, 480, 60]);
      const create = boxed("Box", [236, 252, 480, 24]);
      const previews = boxed("Box", [236, 296, 480, 40]);
      backBox.append(back);
      form.append(name, description, create);
      outer.append(backBox, form, previews);
      cap.append(outer);
      scroll.append(cap);
      pane.append(scroll);
      shell.append(sidebar, pane);
      document.body.append(shell);
      return { shell, outer, backBox, back, form, name, description, create, previews };
    }

    it("inserts into the Stack between children when the pointer is over its row gap", () => {
      const { outer, form, create } = voiceModalFixture();
      expect(withElementFromPoint(outer, () => getDropLocationAtPoint(document, create, 400, 66))).toMatchObject({
        parent: outer, before: form, orientation: "horizontal", top: 66,
      });
    });

    it("drops beside a hovered Stack child instead of beside the shell's main pane", () => {
      const { outer, previews, create } = voiceModalFixture();
      expect(withElementFromPoint(previews, () => getDropLocationAtPoint(document, create, 400, 300))).toMatchObject({
        parent: outer, before: previews, orientation: "horizontal", top: 296,
      });
    });

    it("reorders within the hovered field's own Stack", () => {
      const { form, name, create } = voiceModalFixture();
      expect(withElementFromPoint(name, () => getDropLocationAtPoint(document, create, 400, 80))).toMatchObject({
        parent: form, before: name,
      });
    });

    it("drops beside a button in its own wrapper rather than inside it", () => {
      const { backBox, back, create } = voiceModalFixture();
      expect(withElementFromPoint(back, () => getDropLocationAtPoint(document, create, 250, 20))).toMatchObject({
        parent: backBox, before: back,
      });
    });

    it("never redirects a drop inside the pane to the shell row", () => {
      const fixtureElements = voiceModalFixture();
      const { shell, outer, form, previews, name, description, create } = fixtureElements;
      const probes: [HTMLElement, number, number][] = [
        [outer, 400, 66], [outer, 400, 286], [form, 400, 142], [previews, 400, 316], [name, 400, 130], [description, 400, 150],
      ];
      for (const [element, x, y] of probes) {
        expect(withElementFromPoint(element, () => getDropLocationAtPoint(document, create, x, y))?.parent).not.toBe(shell);
      }
    });
  });

  it("places a column-reverse insertion by visual position", () => {
    const { root, first, second } = fixture();
    Object.assign(root.style, { display: "flex", flexDirection: "column-reverse" });
    Object.defineProperty(root, "getBoundingClientRect", { value: () => ({ left: 0, top: 0, width: 200, height: 190, right: 200, bottom: 190 }) as DOMRect });
    // DOM order first, second renders second above first, inside 30px of padding.
    Object.defineProperty(second, "getBoundingClientRect", { value: () => ({ left: 0, top: 30, width: 200, height: 60, right: 200, bottom: 90 }) as DOMRect });
    Object.defineProperty(first, "getBoundingClientRect", { value: () => ({ left: 0, top: 100, width: 200, height: 60, right: 200, bottom: 160 }) as DOMRect });
    const holder = document.createElement("div");
    holder.dataset.cid = "Holder";
    holder.dataset.src = "src/App.tsx:8:1";
    const dragged = document.createElement("div");
    dragged.dataset.cid = "Dragged";
    dragged.dataset.src = "src/App.tsx:9:1";
    holder.append(dragged);
    document.body.append(holder);

    // Above `second`, the visual top, is the end of the DOM order.
    expect(withElementFromPoint(root, () => getDropLocationAtPoint(document, dragged, 100, 27))).toMatchObject({ parent: root, before: null });
    // In the gap, between them visually, is between them in the DOM.
    expect(withElementFromPoint(root, () => getDropLocationAtPoint(document, dragged, 100, 95))).toMatchObject({
      parent: root, before: second, top: 95,
    });
  });

  it("drops beside a hovered container near its edge rather than among its children", () => {
    const { root, first, second } = fixture();
    const field = document.createElement("div");
    field.dataset.cid = "TextField";
    field.dataset.src = "src/App.tsx:5:1";
    const input = document.createElement("input");
    input.dataset.cid = "TextField";
    input.dataset.src = "src/App.tsx:6:1";
    field.append(input);
    root.insertBefore(field, second);
    Object.defineProperty(field, "getBoundingClientRect", { value: () => ({ left: 0, top: 100, width: 200, height: 60, right: 200, bottom: 160 }) as DOMRect });
    Object.defineProperty(input, "getBoundingClientRect", { value: () => ({ left: 8, top: 120, width: 184, height: 30, right: 192, bottom: 150 }) as DOMRect });

    // The field's top padding is inside its box but within its edge band.
    expect(withElementFromPoint(field, () => getDropLocationAtPoint(document, second, 100, 104))).toMatchObject({
      parent: root, before: field,
    });
    expect(first.nextElementSibling).toBe(field);
  });

  it("does not explain releasing an element back into its current slot", () => {
    const { first, second } = fixture();
    Object.defineProperty(second, "getBoundingClientRect", { value: () => ({ left: 0, top: 100, width: 200, height: 100 }) as DOMRect });

    expect(withElementFromPoint(second, () => getDropAttemptAtPoint(document, first, 40, 105))).toEqual({ drop: null, rejection: null });
  });

  it("rejects a destination without a source site instead of showing a guide that cannot be recorded", () => {
    const { first } = fixture();
    const untracked = document.createElement("div");
    const sibling = document.createElement("div");
    untracked.append(sibling);
    document.body.append(untracked);

    expect(withElementFromPoint(sibling, () => getDropAttemptAtPoint(document, first, 0, 0))).toEqual({
      drop: null,
      rejection: { message: "Can't drop here: this element isn't traced to your source" },
    });
  });

  it("offers no drop while the pointer is over the dragged element inside a button", () => {
    const { root } = fixture();
    root.insertAdjacentHTML("beforeend", `
      <button data-cid="Button" data-src="src/App.tsx:5:1"><span data-cid="Label" data-src="src/App.tsx:6:1">Go</span></button>`);
    const label = root.querySelector<HTMLElement>('[data-cid="Label"]')!;

    expect(withElementFromPoint(label, () => getDropAttemptAtPoint(document, label, 10, 10))).toEqual({ drop: null, rejection: null });
  });

  it("drops into a container inside a link rather than beside the link", () => {
    const { root, first } = fixture();
    root.insertAdjacentHTML("beforeend", `
      <a data-cid="Card" data-src="src/App.tsx:5:1"><div data-cid="CardBody" data-src="src/App.tsx:6:1"></div></a>`);
    const card = root.querySelector<HTMLElement>('[data-cid="Card"]')!;
    const body = root.querySelector<HTMLElement>('[data-cid="CardBody"]')!;
    for (const element of [card, body]) {
      Object.defineProperty(element, "getBoundingClientRect", { value: () => ({ left: 0, top: 100, width: 200, height: 100 }) as DOMRect });
    }

    expect(withElementFromPoint(body, () => getDropLocationAtPoint(document, first, 100, 150))).toMatchObject({ parent: body, before: null });
  });

  it("drops relative to the nearest HTML ancestor of an SVG target", () => {
    const { first, root, second } = fixture();
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    icon.append(path);
    second.append(icon);
    Object.defineProperty(second, "getBoundingClientRect", { value: () => ({ left: 0, top: 100, width: 200, height: 100 }) as DOMRect });

    expect(withElementFromPoint(path, () => getDropLocationAtPoint(document, first, 40, 195))).toMatchObject({ parent: root, before: null });
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

  it("never moves or deletes the page target", () => {
    const { root, first } = fixture();
    const page = resolveSelectionFromElement(document.body)!;
    expect(deleteElement(page)).toBeNull();
    expect(nudgeElement(document.body, "ArrowUp")).toBeNull();
    expect(moveElement(document.body, dropAt(root, first))).toBeNull();
    expect(getStructuralChanges()).toEqual([]);
  });

  it("captures delete intent and projects it through the host adapter", () => {
    const { first, root } = fixture();
    const change = deleteElement(resolveSelectionFromElement(first)!);
    expect(change).toMatchObject({ kind: "delete", target: { sourceSite: { cid: "Item" } } });
    expect(getStructuralChanges()).toEqual([change]);
    expect(root.querySelector('[data-test="first"]')).toBeNull();
  });

  it("does not directly project a Canvas-document delete before its renderer message", () => {
    document.documentElement.setAttribute("data-nudge-ui-editor", "");
    const frameDocument = document.implementation.createHTMLDocument("Canvas frame");
    const root = frameDocument.createElement("div");
    root.dataset.cid = "List";
    root.dataset.src = "src/App.tsx:0:1";
    const target = frameDocument.createElement("div");
    target.dataset.cid = "Item";
    target.dataset.src = "src/App.tsx:1:1";
    root.append(target);
    frameDocument.body.append(root);
    const change = deleteElement(resolveSelectionFromElement(target)!);
    expect(change).not.toBeNull();
    expect(target.isConnected).toBe(true);
    expect(getStructuralChangeDiagnostics(change!.id)).toEqual([]);
  });
});
