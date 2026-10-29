// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { ChangesMenu, changesLabel } from "./ChangesLog.tsx";
import { appendChange, clearActiveDraft } from "../drafts/store.ts";
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

describe("ChangesMenu", () => {
  let container: HTMLDivElement;
  let root: Root;

  /** The list is a popover, portalled to the body outside the inspector. */
  function openChanges(): void {
    act(() => (container.querySelector('[data-test="changes-toggle"]') as HTMLButtonElement).click());
  }

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    clearActiveDraft();
    resetStructuralDeleteProjection();
    resetPreviewDiagnostics();
  });

  it("counts the changes on its trigger and lists them, each with a revert, when opened", () => {
    container = document.createElement("div");
    document.body.appendChild(container);

    act(() => {
      root = createRoot(container);
      root.render(<ChangesMenu />);
    });

    const toggle = container.querySelector('[data-test="changes-toggle"]') as HTMLButtonElement;
    expect(toggle.textContent).toBe("No changes");
    expect(toggle.disabled).toBe(true);

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

    expect(toggle.textContent).toBe("1 Change");
    // Mounted but closed until the count is clicked.
    expect(document.querySelector('[data-test="changes-log"]')?.hasAttribute("data-open")).toBe(false);
    openChanges();
    expect(document.querySelector('[data-test="changes-log"]')?.hasAttribute("data-open")).toBe(true);
    const row = document.querySelector('[data-test="changes-log"] [data-test="change-row"]')!;
    expect(row.querySelector('[data-test="change-target"]')?.textContent).toBe("Button");
    expect(row.querySelector('[data-test="change-action"]')?.textContent).toContain("Changed");
    expect(row.querySelector('[data-test="change-revert"]')?.getAttribute("aria-label")).toBe("Revert change");
    expect(row.querySelector('[data-test="change-revert"] svg')).not.toBeNull();
    expect(row.querySelector(".changes__metadata .changes__value")).not.toBeNull();
  });

  it("labels the count in the singular and plural", () => {
    expect([changesLabel(0), changesLabel(1), changesLabel(3)]).toEqual(["No changes", "1 Change", "3 Changes"]);
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
      root.render(<ChangesMenu />);
    });
    openChanges();

    expect(document.querySelector('[data-test="dom-change-row"]')?.getAttribute("data-action")).toBe("delete");
    expect(document.querySelector('[data-test="structural-target"]')?.textContent).toBe("Item");
    expect(document.querySelector('[data-test="structural-action"]')?.textContent).toBe("Deleted");
    expect(document.querySelector('[data-test="structural-source-site"]')?.textContent).toContain("Item");
    act(() => (document.querySelector('[data-test="dom-change-revert"]') as HTMLButtonElement).click());
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
      root.render(<ChangesMenu />);
    });
    openChanges();

    const row = document.querySelector('[data-test="dom-change-row"]')!;
    expect(row.querySelector('[data-test="structural-action"]')?.textContent).toBe("Moved");
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
      root.render(<ChangesMenu />);
    });
    openChanges();

    const row = document.querySelector('[data-test="dom-change-row"]')!;
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
    resetStructuralDeleteProjection();
    recordCanvasStructuralProjectionReports("card-1", 1, [{
      changeId: "delete-item",
      status: "missing",
      reason: "target",
    }]);

    act(() => {
      root = createRoot(container);
      root.render(<ChangesMenu />);
    });
    openChanges();

    const diagnostic = document.querySelector('[data-test="structural-diagnostic"]')!;
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
      root.render(<ChangesMenu />);
    });
    openChanges();

    const preview = document.querySelector('[data-test="preview-applied"]')!;
    expect(preview.getAttribute("data-status")).toBe("applied");
    expect(preview.textContent).toBe("Preview active");
    expect(document.querySelector('[data-test="preview-conflict"]')).toBeNull();
  });
});
