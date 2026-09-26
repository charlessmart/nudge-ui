// @vitest-environment jsdom
import { act } from "react";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
    act(() => trigger.focus());
    const parentItem = host.querySelector<HTMLButtonElement>('[data-test="dom-navigator-item"][data-cid="Parent"]');
    expect(parentItem).not.toBeNull();

    act(() => parentItem!.click());
    expect(getSelectedElement()?.domElement).toBe(parent);
  });
});
