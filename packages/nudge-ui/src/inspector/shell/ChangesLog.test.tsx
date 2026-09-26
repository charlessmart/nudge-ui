// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { ChangesLog } from "./ChangesLog.tsx";
import { appendChange, clearWorkspace } from "../changes/changesLog.ts";
import {
  createStructuralDelete,
  createStructuralMove,
  recordCanvasStructuralProjectionReports,
  resetStructuralDeleteProjection,
} from "../projection/structuralProjection.ts";
import { changeKey } from "../changes/model.ts";
import {
  beginPreviewAttempt,
  getHostPreviewDocument,
  publishPreviewDiagnostic,
  resetPreviewDiagnostics,
} from "../changes/previewDiagnostics.ts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ChangesLog", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    clearWorkspace();
    resetStructuralDeleteProjection();
    resetPreviewDiagnostics();
  });

  it("starts collapsed and reveals stacked change content on demand", () => {
    container = document.createElement("div");
    document.body.appendChild(container);

    act(() => {
      root = createRoot(container);
      root.render(<ChangesLog />);
    });

    expect(container.querySelector('[data-test="changes-log"]')).toBeNull();

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

    const root_ = container.querySelector('[data-test="changes-log"]')!;
    const toggle = root_.querySelector('[data-test="changes-toggle"]') as HTMLElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(root_.querySelector('[data-test="change-row"]')).not.toBeNull();
    expect(root_.querySelector('[data-test="change-row"]')?.querySelector(".changes__value")).not.toBeNull();

    act(() => {
      toggle.click();
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("renders the clear-session action below the accordion", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const onClearSession = () => undefined;

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
      root = createRoot(container);
      root.render(<ChangesLog onClearSession={onClearSession} />);
    });

    const root_ = container.querySelector('[data-test="changes-log"]')!;
    const actions = container.querySelector('[data-test="session-actions"]')!;
    expect(actions.previousElementSibling).toBe(root_);
    expect(actions.querySelector('[data-test="clear-session"]')?.textContent).toBe("Clear Changes");
    expect(actions.querySelector('[data-test="clear-session"]')?.className).toContain("button--secondary");
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

  it("presents both durable containers for a cross-container move", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const source = document.createElement("section");
    source.dataset.cid = "List";
    source.dataset.src = "src/List.tsx:1:1";
    const destination = document.createElement("aside");
    destination.dataset.cid = "SavedItems";
    destination.dataset.src = "src/Saved.tsx:9:3";
    const target = document.createElement("li");
    target.dataset.cid = "Item";
    target.dataset.src = "src/List.tsx:2:1";
    target.textContent = "Docs";
    source.append(target);
    document.body.append(source, destination);
    createStructuralMove(target, { parent: destination, before: null }, "move-cross");

    act(() => {
      root = createRoot(container);
      root.render(<ChangesLog />);
    });

    const row = container.querySelector('[data-test="dom-change-row"]')!;
    expect(row.textContent).toContain("List (section) position 1");
    expect(row.textContent).toContain("SavedItems (aside) position 1");
  });

  it("labels the address that caused a structural projection diagnostic", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const target = document.createElement("div");
    target.dataset.cid = "Item";
    target.dataset.src = "src/List.tsx:8:1";
    document.body.appendChild(target);
    createStructuralDelete(target, "delete-item");
    recordCanvasStructuralProjectionReports("card-1", 1, [{
      changeId: "delete-item",
      status: "missing",
      reason: "target",
    }]);

    act(() => {
      root = createRoot(container);
      root.render(<ChangesLog />);
    });

    const diagnostic = container.querySelector('[data-test="structural-diagnostic"]')!;
    expect(diagnostic.getAttribute("data-reason")).toBe("target");
    expect(diagnostic.textContent).toContain("Canvas card-1: missing (target address)");
  });

  it("shows an active preview separately from a conflict or verified change", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const change = {
      cid: "Button",
      file: "src/Button.tsx",
      line: 1,
      selector: '[data-cid="Button"]',
      property: "color",
      oldToken: null,
      newToken: null,
      rawValue: "red",
      source: { file: "src/Button.tsx", line: 1, component: "Button" },
    } as const;
    appendChange(change);
    const attempt = beginPreviewAttempt(getHostPreviewDocument())!;
    publishPreviewDiagnostic(attempt, changeKey(change), {
      status: "applied",
      requestedValue: "red",
      computedValue: "red",
    });

    act(() => {
      root = createRoot(container);
      root.render(<ChangesLog />);
    });

    const preview = container.querySelector('[data-test="preview-applied"]')!;
    expect(preview.getAttribute("data-status")).toBe("applied");
    expect(preview.textContent).toBe("Preview active");
    expect(container.querySelector('[data-test="preview-conflict"]')).toBeNull();
  });
});
