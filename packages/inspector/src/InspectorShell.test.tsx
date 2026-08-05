// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { mountInspector, unmountInspector } from "./index.ts";
import { setSelectedElement } from "./selectionStore.ts";
import { resolveSelectionFromElement } from "./resolveSelection.ts";
import { acquireLease, releaseLease } from "./canvas/workspaceLease.ts";
import { clearRestoreCount, setRestoreCount } from "./canvas/sessionStore.ts";

// Signal to React that the surrounding test environment supports act().
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function pressKey(init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

describe("InspectorShell", () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement("div");
    host.id = "design-tool-root";
    document.body.appendChild(host);
    acquireLease();
  });

  afterEach(() => {
    act(() => {
      unmountInspector();
    });
    clearRestoreCount();
    releaseLease();
    host.remove();
  });

  it("mountInspector attaches a shadow root to the host element", () => {
    act(() => {
      mountInspector(host);
    });
    expect(host.shadowRoot).not.toBeNull();
  });

  it("renders the shell without placeholder copy", () => {
    act(() => {
      mountInspector(host);
    });
    const shadow = host.shadowRoot!;
    expect(shadow.textContent).not.toContain("Inspector shell ready");
    expect(shadow.querySelector(".dt-panel__state")).toBeNull();
  });

  it("shows a bounded DOM tree and selects its parent and child layers", () => {
    const layers = Array.from({ length: 7 }, (_, index) => {
      const node = document.createElement(index === 0 ? "button" : "div");
      node.setAttribute("data-cid", `Layer${index}`);
      node.setAttribute("data-src", `fixtures/layer${index}.tsx:1:1`);
      return node;
    });
    for (let index = 1; index < layers.length; index++) layers[index]!.appendChild(layers[index - 1]!);
    document.body.appendChild(layers[6]!);

    act(() => {
      setSelectedElement(resolveSelectionFromElement(layers[0]!));
      mountInspector(host);
    });

    const shadow = host.shadowRoot!;
    const steps = [...shadow.querySelectorAll<HTMLButtonElement>('[data-test="breadcrumb-step"]')];
    expect(steps).toHaveLength(5);
    expect(steps.map((step) => step.dataset.cid)).toEqual([
      "Layer4",
      "Layer3",
      "Layer2",
      "Layer1",
      "Layer0",
    ]);
    expect(shadow.querySelector('[data-test="breadcrumb"]')?.getAttribute("aria-label")).toBe("DOM tree");

    act(() => {
      shadow.querySelector<HTMLButtonElement>('[data-test="breadcrumb-step"][data-index="2"]')!.click();
    });
    expect(shadow.querySelector('[data-test="selection"]')?.getAttribute("data-selected-cid")).toBe("Layer2");

    act(() => {
      shadow.querySelector<HTMLButtonElement>('[data-test="breadcrumb-step"][data-index="0"]')!.click();
    });
    expect(shadow.querySelector('[data-test="selection"]')?.getAttribute("data-selected-cid")).toBe("Layer0");

    setSelectedElement(null);
    layers[6]!.remove();
  });

  it("keeps session clearing below the changes accordion without restore-count copy", () => {
    setRestoreCount(7);
    act(() => {
      mountInspector(host);
    });
    const shadow = host.shadowRoot!;
    expect(shadow.textContent).not.toContain("Restored 7 changes");
    expect(shadow.querySelector('[data-test="session-actions"]')?.previousElementSibling?.matches(".dt-changes")).toBe(true);
    expect(shadow.querySelector('[data-test="clear-session"]')?.textContent).toBe("Clear Session");
    expect(shadow.querySelector(".dt-panel__session-actions")).toBeNull();
  });

  it("switches to the Tokens tab without requiring a selection", () => {
    act(() => {
      mountInspector(host);
    });
    const shadow = host.shadowRoot!;
    expect(shadow.querySelector('[data-test="tokens-panel"]')).toBeNull();
    act(() => {
      (shadow.querySelector('[data-test="tokens-tab"]') as HTMLButtonElement).click();
    });
    expect(shadow.querySelector('[data-test="tokens-panel"]')).not.toBeNull();
    expect(shadow.querySelector('[data-test="tokens-tab"]')?.getAttribute("aria-selected")).toBe("true");
    expect(shadow.querySelector('[data-test="tokens-tab"]')?.className).toContain("dt-button--secondary");
    expect(shadow.querySelector('[data-test="inspect-tab"]')?.className).toContain("dt-button--quiet");
  });

  it("unmountInspector clears the React tree from the shadow root", () => {
    act(() => {
      mountInspector(host);
    });
    const shadow = host.shadowRoot!;
    expect(shadow.textContent).not.toContain("Inspector shell ready");
    act(() => {
      unmountInspector();
    });
    expect(shadow.textContent).not.toContain("Inspector shell ready");
  });

  it("Alt+I toggles the panel's data-open attribute", () => {
    act(() => {
      mountInspector(host);
    });
    const shadow = host.shadowRoot!;
    const panel = shadow.querySelector(".dt-panel")!;
    const before = panel.getAttribute("data-open");

    act(() => {
      pressKey({ key: "i", code: "KeyI", altKey: true });
    });
    const first = panel.getAttribute("data-open");
    expect(first).not.toBe(before);

    act(() => {
      pressKey({ key: "i", code: "KeyI", altKey: true });
    });
    const second = panel.getAttribute("data-open");
    expect(second).toBe(before);
  });

  it("prevents page-scrolling Space and arrow keys while open", () => {
    act(() => {
      mountInspector(host);
    });

    let space: KeyboardEvent;
    let arrowDown: KeyboardEvent;
    act(() => {
      space = pressKey({ code: "Space", key: " " });
      arrowDown = pressKey({ key: "ArrowDown" });
    });
    expect(space!.defaultPrevented).toBe(true);
    expect(arrowDown!.defaultPrevented).toBe(true);
  });

  it("leaves arrow keys available to focused inspector inputs", () => {
    act(() => {
      mountInspector(host);
    });
    const shadow = host.shadowRoot!;
    act(() => {
      (shadow.querySelector('[data-test="tokens-tab"]') as HTMLButtonElement).click();
    });
    const input = shadow.querySelector('[data-test="token-search"]') as HTMLInputElement;

    const event = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    act(() => {
      input.focus();
      input.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
  });

  it("does not delete the selected element from a focused inspector input", () => {
    act(() => {
      mountInspector(host);
    });
    const selected = document.createElement("div");
    selected.setAttribute("data-cid", "Selected");
    selected.setAttribute("data-src", "src/Selected.tsx:1:1");
    document.body.append(selected);
    act(() => {
      setSelectedElement(resolveSelectionFromElement(selected));
      (host.shadowRoot!.querySelector('[data-test="tokens-tab"]') as HTMLButtonElement).click();
    });
    const input = host.shadowRoot!.querySelector('[data-test="token-search"]') as HTMLInputElement;
    const event = new KeyboardEvent("keydown", {
      key: "Delete",
      bubbles: true,
      composed: true,
      cancelable: true,
    });

    act(() => {
      input.focus();
      input.dispatchEvent(event);
    });

    expect(selected.isConnected).toBe(true);
    expect(event.defaultPrevented).toBe(false);
    act(() => {
      setSelectedElement(null);
      selected.remove();
    });
  });

  it("reserves the panel width while open and releases it when hidden", () => {
    act(() => {
      mountInspector(host);
    });
    expect(document.documentElement.getAttribute("data-design-tool-panel")).toBe("open");
    expect(document.getElementById("design-tool-panel-layout")).not.toBeNull();

    act(() => {
      pressKey({ key: "i", code: "KeyI", altKey: true });
    });
    expect(document.documentElement.hasAttribute("data-design-tool-panel")).toBe(false);

    act(() => {
      unmountInspector();
    });
    expect(document.getElementById("design-tool-panel-layout")).toBeNull();
  });

  it("collapses from the header and restores through the floating icon button", () => {
    act(() => {
      mountInspector(host);
    });
    const shadow = host.shadowRoot!;
    const panel = shadow.querySelector(".dt-panel")!;
    const collapse = shadow.querySelector('[data-test="collapse-inspector"]') as HTMLButtonElement;
    expect(collapse.getAttribute("aria-label")).toBe("Collapse inspector");

    act(() => collapse.click());
    expect(panel.getAttribute("data-open")).toBe("false");
    expect(document.documentElement.hasAttribute("data-design-tool-panel")).toBe(false);

    const show = shadow.querySelector('[data-test="show-inspector"]') as HTMLButtonElement;
    expect(show.getAttribute("aria-label")).toBe("Show inspector");
    act(() => show.click());
    expect(panel.getAttribute("data-open")).toBe("true");
    expect(document.documentElement.getAttribute("data-design-tool-panel")).toBe("open");
  });

  it("non-Alt+I keys do not toggle", () => {
    act(() => {
      mountInspector(host);
    });
    const shadow = host.shadowRoot!;
    const panel = shadow.querySelector(".dt-panel")!;
    const before = panel.getAttribute("data-open");

    act(() => {
      pressKey({ key: "i", code: "KeyI" });
      pressKey({ key: "a", code: "KeyA", altKey: true });
      pressKey({ key: "I", code: "KeyI" });
    });
    expect(panel.getAttribute("data-open")).toBe(before);
  });

  it("Backslash visibility shortcuts toggle the panel but leave editable fields alone", () => {
    act(() => {
      mountInspector(host);
    });
    const shadow = host.shadowRoot!;
    const panel = shadow.querySelector(".dt-panel")!;
    const before = panel.getAttribute("data-open");

    act(() => {
      pressKey({ key: "|", code: "Backslash", shiftKey: true });
    });
    expect(panel.getAttribute("data-open")).not.toBe(before);

    act(() => {
      pressKey({ key: "\\", code: "Backslash", metaKey: true });
    });
    expect(panel.getAttribute("data-open")).toBe(before);

    act(() => {
      pressKey({ key: "\\", code: "Backslash", ctrlKey: true });
    });
    expect(panel.getAttribute("data-open")).not.toBe(before);

    act(() => {
      (shadow.querySelector('[data-test="tokens-tab"]') as HTMLButtonElement).click();
    });
    const input = shadow.querySelector('[data-test="token-search"]') as HTMLInputElement;
    act(() => {
      input.focus();
      input.dispatchEvent(new KeyboardEvent("keydown", {
        key: "\\",
        code: "Backslash",
        ctrlKey: true,
        bubbles: true,
        composed: true,
        cancelable: true,
      }));
    });
    expect(panel.getAttribute("data-open")).not.toBe(before);
  });

  it("mountInspector is idempotent across remounts", () => {
    act(() => {
      mountInspector(host);
    });
    expect(host.shadowRoot).not.toBeNull();
    act(() => {
      unmountInspector();
    });
    const host2 = document.createElement("div");
    document.body.appendChild(host2);
    act(() => {
      mountInspector(host2);
    });
    expect(host2.shadowRoot).not.toBeNull();
    expect(host2.shadowRoot!.textContent).not.toContain("Inspector shell ready");
    host2.remove();
  });
});
