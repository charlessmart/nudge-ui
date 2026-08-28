// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { ChangesLog } from "./ChangesLog.tsx";
import { appendChange, clearChanges } from "./changesLog.ts";
import {
  clearStructuralChanges,
  createStructuralDelete,
  createStructuralMove,
  resetStructuralDeleteProjection,
} from "./structuralProjection.ts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ChangesLog", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    clearChanges();
    clearStructuralChanges();
    resetStructuralDeleteProjection();
  });

  it("starts collapsed and reveals stacked change content on demand", () => {
    container = document.createElement("div");
    document.body.appendChild(container);

    act(() => {
      root = createRoot(container);
      root.render(<ChangesLog />);
    });

    expect(container.querySelector("details")?.hasAttribute("open")).toBe(false);
    expect(container.querySelector('[data-test="changes-toggle"]')).not.toBeNull();

    act(() => {
      appendChange({
        cid: "Button",
        file: "src/Button.tsx",
        line: 1,
        selector: '[data-cid="Button"]',
        property: "color",
        oldToken: null,
        newToken: null,
        rawValue: "red",
        source: { file: "src/Button.tsx", line: 1, component: "Button" },
      });
    });

    const details = container.querySelector("details")!;
    expect(details.hasAttribute("open")).toBe(false);
    expect(details.querySelector('[data-test="change-row"]')).not.toBeNull();
    expect(details.querySelector('[data-test="change-row"]')?.querySelector(".changes__value")).not.toBeNull();

    act(() => {
      (details.querySelector('[data-test="changes-toggle"]') as HTMLElement).click();
    });
    expect(details.hasAttribute("open")).toBe(true);
  });

  it("renders the clear-session action below the accordion", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const onClearSession = () => undefined;

    act(() => {
      root = createRoot(container);
      root.render(<ChangesLog onClearSession={onClearSession} />);
    });

    const details = container.querySelector("details")!;
    const actions = container.querySelector('[data-test="session-actions"]')!;
    expect(actions.previousElementSibling).toBe(details);
    expect(actions.querySelector('[data-test="clear-session"]')?.textContent).toBe("Clear Changes");
    expect(actions.querySelector('[data-test="clear-session"]')?.className).toContain("button--secondary");
    expect(actions.querySelector('[data-test="clear-session"]')?.className).toContain("button--compact");
  });

  it("presents and reverts canonical structural changes directly", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const target = document.createElement("div");
    target.dataset.cid = "Item";
    target.dataset.src = "src/List.tsx:8:1";
    document.body.appendChild(target);
    const change = createStructuralDelete(target, "delete-item")!;

    act(() => {
      root = createRoot(container);
      root.render(<ChangesLog />);
    });

    expect(container.querySelector('[data-test="dom-change-row"]')?.getAttribute("data-action")).toBe("delete");
    expect(container.querySelector('[data-test="structural-source-site"]')?.textContent).toContain("Item");
    act(() => (container.querySelector('[data-test="dom-change-revert"]') as HTMLButtonElement).click());
    expect(target.isConnected).toBe(true);
    expect(change.id).toBe("delete-item");
  });

  it("presents a structural move with its parent tag and sibling positions", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const list = document.createElement("ul");
    list.dataset.cid = "List";
    list.dataset.src = "src/List.tsx:1:1";
    const first = document.createElement("li");
    first.dataset.cid = "Item";
    first.dataset.src = "src/List.tsx:2:1";
    first.textContent = "First";
    const second = document.createElement("li");
    second.dataset.cid = "Item";
    second.dataset.src = "src/List.tsx:2:1";
    second.textContent = "Second";
    list.append(first, second);
    document.body.appendChild(list);
    createStructuralMove(second, { parent: list, before: first }, "move-item");

    act(() => {
      root = createRoot(container);
      root.render(<ChangesLog />);
    });

    const row = container.querySelector('[data-test="dom-change-row"]')!;
    expect(row.textContent).toContain("ul position 2");
    expect(row.textContent).toContain("ul position 1");
  });
});
