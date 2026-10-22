// @vitest-environment jsdom
import { act } from "react";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeHierarchy, NAVIGATOR_CHILD_LIMIT } from "../selection/hierarchy.ts";
import { getSelectedElement, setSelectedElement } from "../selection/selectionStore.ts";
import { resolveSelectionFromElement } from "../selection/resolveSelection.ts";
import { DomNavigator } from "./DomNavigator.tsx";
import { PAGE_TARGET_CID } from "../selection/pageTarget.ts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("DomNavigator", () => {
  let host: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    setSelectedElement(null);
    host.remove();
  });

  it("expands the nearby elements and selects a parent", () => {
    const parent = document.createElement("div");
    parent.dataset.cid = "Parent";
    parent.dataset.src = "Parent.tsx:1:1";
    const selected = document.createElement("button");
    selected.dataset.cid = "Selected";
    selected.dataset.src = "Selected.tsx:1:1";
    parent.append(selected);
    document.body.append(parent);
    setSelectedElement(resolveSelectionFromElement(selected));

    root = createRoot(host);
    act(() => {
      root!.render(createElement(DomNavigator, {
        selected: resolveSelectionFromElement(selected)!,
        hierarchy: computeHierarchy(selected),
        anchor: { left: 10, top: 20, width: 30, height: 30 },
        project: () => ({ left: 1, top: 2, width: 3, height: 4 }),
      }));
    });

    const trigger = host.querySelector<HTMLButtonElement>('[data-test="dom-navigator-trigger"]')!;
    expect(host.querySelector(".dom-navigator__label")?.textContent).toBe("button");
    expect(trigger.getAttribute("aria-label")).toBe("Open DOM navigator");
    act(() => trigger.click());
    const parentItem = document.body.querySelector<HTMLButtonElement>('[data-test="dom-navigator-item"][data-cid="Parent"]');
    expect(parentItem).not.toBeNull();
    expect(parentItem?.textContent).toBe("div");
    const selectedItem = document.body.querySelector<HTMLButtonElement>('[data-test="dom-navigator-item"][data-current="true"]');
    expect(selectedItem?.textContent).toBe("button");

    act(() => parentItem!.click());
    expect(getSelectedElement()?.domElement).toBe(parent);
  });

  it("keeps the selected element between visible parents and its direct children", () => {
    const grandparent = document.createElement("main");
    grandparent.dataset.cid = "Grandparent";
    const parent = document.createElement("section");
    parent.dataset.cid = "Parent";
    const selected = document.createElement("button");
    selected.dataset.cid = "Selected";
    const child = document.createElement("span");
    child.dataset.cid = "Child";
    const grandchild = document.createElement("em");
    grandchild.dataset.cid = "Grandchild";
    grandparent.append(parent);
    parent.append(selected);
    selected.append(child);
    child.append(grandchild);
    host.append(grandparent);
    setSelectedElement(resolveSelectionFromElement(selected));

    root = createRoot(host);
    act(() => {
      root!.render(createElement(DomNavigator, {
        selected: resolveSelectionFromElement(selected)!,
        hierarchy: computeHierarchy(selected),
        anchor: { left: 10, top: 20, width: 30, height: 30 },
        project: () => null,
      }));
    });

    act(() => host.querySelector<HTMLButtonElement>('[data-test="dom-navigator-trigger"]')!.click());
    const items = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[data-test="dom-navigator-item"]'));
    expect(items.map((item) => item.textContent)).toEqual(["main", "section", "button", "span"]);
    expect(items.map((item) => item.dataset.depth)).toEqual(["0", "1", "2", "3"]);
    expect(items[2]?.dataset.current).toBe("true");

    const expander = document.body.querySelector<HTMLButtonElement>('[data-test="dom-navigator-expander"]')!;
    expect(expander.getAttribute("aria-expanded")).toBe("false");
    act(() => expander.click());
    const expanded = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[data-test="dom-navigator-item"]'));
    expect(expanded.map((item) => item.textContent)).toEqual(["main", "section", "button", "span", "em"]);
    expect(expanded[4]?.dataset.depth).toBe("4");
    expect(document.body.querySelector('[data-test="dom-navigator-expander"]')?.getAttribute("aria-expanded")).toBe("true");
  });

  it("lists every child and counts the ones past the limit", () => {
    const selected = document.createElement("div");
    selected.dataset.cid = "Selected";
    const children = Array.from({ length: NAVIGATOR_CHILD_LIMIT + 3 }, (_, index) => {
      const child = document.createElement("span");
      child.dataset.cid = `Child${index}`;
      return child;
    });
    selected.append(...children);
    host.append(selected);

    root = createRoot(host);
    act(() => {
      root!.render(createElement(DomNavigator, {
        selected: resolveSelectionFromElement(selected)!,
        hierarchy: computeHierarchy(selected),
        anchor: { left: 10, top: 20, width: 30, height: 30 },
        project: () => null,
      }));
    });

    act(() => host.querySelector<HTMLButtonElement>('[data-test="dom-navigator-trigger"]')!.click());

    const items = document.body.querySelectorAll('[data-test="dom-navigator-item"]');
    expect(items).toHaveLength(NAVIGATOR_CHILD_LIMIT + 1);
    expect(document.body.querySelector('[data-test="dom-navigator-more"]')?.textContent).toBe("+3 more");
    expect(document.body.querySelector('[data-test="dom-navigator-expander"]')).toBeNull();
  });

  it("names only the tag, followed by the selected element's rounded size", () => {
    const parent = document.createElement("div");
    parent.dataset.cid = "Parent";
    const selected = document.createElement("button");
    selected.dataset.cid = "Selected";
    selected.id = "save";
    selected.className = "primary-action large";
    parent.append(selected);
    host.append(parent);

    const render = (size?: { width: number; height: number }): void => {
      act(() => {
        root!.render(createElement(DomNavigator, {
          selected: resolveSelectionFromElement(selected)!,
          hierarchy: computeHierarchy(selected),
          anchor: { left: 10, top: 20, width: 30, height: 30 },
          size,
          project: () => null,
        }));
      });
    };
    root = createRoot(host);
    render({ width: 63.6, height: 32.2 });

    expect(host.querySelector(".dom-navigator__label")?.textContent).toBe("button");
    expect(host.querySelector('[data-test="dom-navigator-size"]')?.textContent).toBe("64 × 32");

    // The menu rows still carry the id and classes for telling similar elements apart.
    act(() => host.querySelector<HTMLButtonElement>('[data-test="dom-navigator-trigger"]')!.click());
    expect(document.body.querySelector('[data-test="dom-navigator-item"][data-current="true"]')?.textContent).toBe("button#save.primary-action.large");

    render();
    expect(host.querySelector('[data-test="dom-navigator-size"]')).toBeNull();
  });

  it("sits centered below the selection and stays inside the viewport", () => {
    const parent = document.createElement("div");
    parent.dataset.cid = "Parent";
    const selected = document.createElement("button");
    selected.dataset.cid = "Selected";
    parent.append(selected);
    host.append(parent);

    const positionFor = (anchor: { left: number; top: number; width: number; height: number }): { left: string; top: string } => {
      act(() => {
        root!.render(createElement(DomNavigator, {
          selected: resolveSelectionFromElement(selected)!,
          hierarchy: computeHierarchy(selected),
          anchor,
          project: () => null,
        }));
      });
      const chip = host.querySelector<HTMLElement>('[data-test="dom-navigator"]')!;
      return { left: chip.style.left, top: chip.style.top };
    };
    root = createRoot(host);

    // jsdom has no layout, so the chip measures zero and sits on the selection's horizontal center.
    expect(positionFor({ left: 100, top: 50, width: 200, height: 40 })).toEqual({ left: "200px", top: "98px" });
    expect(positionFor({ left: -100, top: 50, width: 50, height: 40 }).left).toBe("4px");
    expect(positionFor({ left: 100, top: window.innerHeight, width: 200, height: 40 }).top).toBe(`${window.innerHeight - 4}px`);
  });

  it("opens only on icon click and stays open when the pointer leaves", () => {
    const parent = document.createElement("div");
    parent.dataset.cid = "Parent";
    const selected = document.createElement("button");
    selected.dataset.cid = "Selected";
    parent.append(selected);
    host.append(parent);

    root = createRoot(host);
    act(() => {
      root!.render(createElement(DomNavigator, {
        selected: resolveSelectionFromElement(selected)!,
        hierarchy: computeHierarchy(selected),
        anchor: { left: 10, top: 20, width: 30, height: 30 },
        project: () => null,
      }));
    });

    const trigger = host.querySelector<HTMLButtonElement>('[data-test="dom-navigator-trigger"]')!;
    const label = host.querySelector<HTMLElement>(".dom-navigator__label")!;
    act(() => {
      label.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      label.click();
      trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      trigger.focus();
    });
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    act(() => trigger.click());
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    act(() => trigger.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body })));
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();

    act(() => trigger.click());
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("offers the page above the tracked ancestors and lists its children once selected", () => {
    const section = document.createElement("section");
    section.dataset.cid = "Section";
    const selected = document.createElement("button");
    selected.dataset.cid = "Selected";
    section.append(selected);
    document.body.append(section);
    const render = (element: HTMLElement): void => {
      act(() => {
        root!.render(createElement(DomNavigator, {
          selected: resolveSelectionFromElement(element)!,
          hierarchy: computeHierarchy(element),
          anchor: { left: 10, top: 20, width: 30, height: 30 },
          project: () => ({ left: 1, top: 2, width: 3, height: 4 }),
        }));
      });
    };
    setSelectedElement(resolveSelectionFromElement(selected));
    root = createRoot(host);
    render(selected);

    act(() => host.querySelector<HTMLButtonElement>('[data-test="dom-navigator-trigger"]')!.click());
    const items = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[data-test="dom-navigator-item"]'));
    expect(items.map((item) => [item.textContent, item.dataset.depth])).toEqual([["body", "0"], ["section", "1"], ["button", "2"]]);
    act(() => items[0]!.click());
    expect(getSelectedElement()).toMatchObject({ cid: PAGE_TARGET_CID, domElement: document.body });

    render(document.body);
    act(() => host.querySelector<HTMLButtonElement>('[data-test="dom-navigator-trigger"]')!.click());
    const pageItems = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[data-test="dom-navigator-item"]'));
    // Without the inspector's shadow root, jsdom portals the menu into the body, so it lists that menu too.
    expect(pageItems.map((item) => [item.textContent, item.dataset.current ?? null])).toEqual(expect.arrayContaining([["body", "true"], ["section", null]]));
    expect(pageItems[0]?.dataset.current).toBe("true");
    section.remove();
  });
});
