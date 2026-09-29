// @vitest-environment jsdom
import { act } from "react";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeHierarchy } from "../selection/hierarchy.ts";
import { getSelectedElement, setSelectedElement } from "../selection/selectionStore.ts";
import { resolveSelectionFromElement } from "../selection/resolveSelection.ts";
import { DomNavigator } from "./DomNavigator.tsx";

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
    expect(trigger.textContent).toBe("button");
    act(() => trigger.focus());
    const parentItem = document.body.querySelector<HTMLButtonElement>('[data-test="dom-navigator-item"][data-cid="Parent"]');
    expect(parentItem).not.toBeNull();
    expect(parentItem?.textContent).toBe("div");
    const selectedItem = document.body.querySelector<HTMLButtonElement>('[data-test="dom-navigator-item"][data-current="true"]');
    expect(selectedItem?.textContent).toBe("button");

    act(() => parentItem!.click());
    expect(getSelectedElement()?.domElement).toBe(parent);
  });

  it("keeps the selected element between visible parents and children", () => {
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

    act(() => host.querySelector<HTMLButtonElement>('[data-test="dom-navigator-trigger"]')!.focus());
    const items = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[data-test="dom-navigator-item"]'));
    expect(items.map((item) => item.textContent)).toEqual(["main", "section", "button", "span", "em"]);
    expect(items.map((item) => item.dataset.depth)).toEqual(["0", "1", "2", "3", "4"]);
    expect(items[2]?.dataset.current).toBe("true");
  });

  it("keeps the menu open while the pointer crosses the gap between trigger and menu", () => {
    vi.useFakeTimers();
    try {
      const parent = document.createElement("div");
      parent.dataset.cid = "Parent";
      const selected = document.createElement("button");
      selected.dataset.cid = "Selected";
      parent.append(selected);
      document.body.append(parent);
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

      const trigger = host.querySelector<HTMLButtonElement>('[data-test="dom-navigator-trigger"]')!;
      const enterFromOutside = (element: Element): void => {
        act(() => element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body })));
      };
      const leaveToOutside = (element: Element): void => {
        act(() => element.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body })));
      };

      // Hovering the trigger opens the popover.
      enterFromOutside(trigger);
      const menu = document.body.querySelector<HTMLElement>(".dom-navigator__menu");
      expect(menu).not.toBeNull();

      // Pointer leaves the trigger into the gap; the close is deferred, not immediate.
      leaveToOutside(trigger);
      expect(document.body.querySelector(".dom-navigator__menu")).not.toBeNull();

      // Pointer reaches the menu before the delay elapses, cancelling the pending close.
      enterFromOutside(menu!);
      act(() => vi.advanceTimersByTime(1000));
      expect(document.body.querySelector(".dom-navigator__menu")).not.toBeNull();

      // Leaving the menu for good still closes it.
      leaveToOutside(menu!);
      act(() => vi.advanceTimersByTime(1000));
      expect(document.body.querySelector(".dom-navigator__menu")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
