// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { mountInspector, unmountInspector } from "../index.ts";
import { getSelectedElement, setSelectedElement, setSelectedElements } from "../selection/selectionStore.ts";
import * as selectionResolver from "../selection/resolveSelection.ts";
import { resolveSelectionFromElement } from "../selection/resolveSelection.ts";
import { appendChange, clearWorkspace, getChangesList } from "../changes/changesLog.ts";
import { acquireLease, releaseLease } from "../canvas/workspaceLease.ts";
import { setCanvasMode } from "../canvas/canvasStore.ts";
import { clearRestoreCount } from "../canvas/sessionStore.ts";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import { setInputValue } from "../styleEditors/_testUtils.ts";

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
    host.id = "nudge-ui-root";
    document.body.appendChild(host);
    acquireLease();
  });

  afterEach(() => {
    act(() => {
      unmountInspector();
    });
    clearWorkspace();
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



  it("shows two tracked parents and two tracked descendants for the selected element", () => {
    const previousConfig = getNudgeUiRuntimeConfig();
    const grandparent = document.createElement("div");
    grandparent.dataset.cid = "Grandparent";
    grandparent.dataset.src = "fixtures/grandparent.tsx:1:1";
    const parent = document.createElement("div");
    parent.dataset.cid = "Parent";
    parent.dataset.src = "fixtures/parent.tsx:1:1";
    const selected = document.createElement("button");
    selected.dataset.cid = "Selected";
    selected.dataset.src = "fixtures/selected.tsx:1:1";
    const child = document.createElement("span");
    child.dataset.cid = "Child";
    child.dataset.src = "fixtures/child.tsx:1:1";
    const grandchild = document.createElement("span");
    grandchild.dataset.cid = "Grandchild";
    grandchild.dataset.src = "fixtures/grandchild.tsx:1:1";
    child.appendChild(grandchild);
    selected.appendChild(child);
    parent.appendChild(selected);
    grandparent.appendChild(parent);
    document.body.appendChild(grandparent);

    try {
      configureNudgeUiRuntime({
        ...previousConfig,
        capabilities: { ...previousConfig.capabilities, domNavigation: false },
      });
      host.dataset.nudgeUiDebug = "true";
      act(() => {
        setSelectedElement(resolveSelectionFromElement(selected));
        mountInspector(host);
      });

      const shadow = host.shadowRoot!;
      expect(getNudgeUiRuntimeConfig().capabilities.domNavigation).toBe(true);
      expect(shadow.querySelector('[data-test="dom-navigation"]')).not.toBeNull();
      expect([...shadow.querySelectorAll<HTMLButtonElement>('[data-test="dom-parent-step"]')].map((step) => step.dataset.cid)).toEqual([
        "Parent",
        "Grandparent",
      ]);
      expect([...shadow.querySelectorAll<HTMLButtonElement>('[data-test="dom-child-step"]')].map((step) => step.dataset.cid)).toEqual([
        "Child",
        "Grandchild",
      ]);
      expect(getSelectedElement()?.cid).toBe("Selected");

      act(() => {
        shadow.querySelector<HTMLButtonElement>('[data-test="dom-parent-step"][data-depth="2"]')!.click();
      });
      expect(getSelectedElement()?.cid).toBe("Grandparent");

      act(() => {
        setSelectedElement(resolveSelectionFromElement(selected));
      });
      act(() => {
        shadow.querySelector<HTMLButtonElement>('[data-test="dom-child-step"][data-cid="Grandchild"]')!.click();
      });
      expect(getSelectedElement()?.cid).toBe("Grandchild");
    } finally {
      setSelectedElement(null);
      grandparent.remove();
      delete host.dataset.nudgeUiDebug;
      configureNudgeUiRuntime(previousConfig);
    }
  });

  it("removes the source-site scope section for a uniquely mounted element", () => {
    const selected = document.createElement("button");
    selected.dataset.cid = "Selected";
    selected.dataset.src = "fixtures/selected.tsx:1:1";
    document.body.appendChild(selected);

    try {
      act(() => {
        setSelectedElement(resolveSelectionFromElement(selected));
        mountInspector(host);
      });

      expect(host.shadowRoot?.querySelector('[data-test="edit-scope"]')).toBeNull();
      expect(host.shadowRoot?.querySelector('[data-test="selection"]')).toBeNull();
    } finally {
      setSelectedElement(null);
      selected.remove();
    }
  });

  it("does not re-resolve component metadata after a CSS edit", () => {
    const selected = document.createElement("button");
    selected.dataset.cid = "Selected";
    selected.dataset.src = "fixtures/selected.tsx:1:1";
    document.body.appendChild(selected);
    const resolveSpy = vi.spyOn(selectionResolver, "resolveSelectionFromElement");

    try {
      act(() => {
        setSelectedElement(selectionResolver.resolveSelectionFromElement(selected));
        mountInspector(host);
      });
      resolveSpy.mockClear();

      const input = host.shadowRoot?.querySelector<HTMLInputElement>(
        '[data-test="token-field"][data-property="font-size"] [data-test="raw-input"]',
      );
      expect(input).not.toBeNull();

      setInputValue(input!, "18px");

      expect(resolveSpy).not.toHaveBeenCalled();
    } finally {
      resolveSpy.mockRestore();
      setSelectedElement(null);
      selected.remove();
    }
  });

  it("shows the source-site scope status when multiple elements share a source site", () => {
    const selected = document.createElement("button");
    selected.dataset.cid = "Selected";
    selected.dataset.src = "fixtures/selected.tsx:1:1";
    const linked = document.createElement("button");
    linked.dataset.cid = "Selected";
    linked.dataset.src = "fixtures/selected.tsx:1:1";
    document.body.append(selected, linked);

    try {
      act(() => {
        setSelectedElement(resolveSelectionFromElement(selected));
        mountInspector(host);
      });

      const scope = host.shadowRoot?.querySelector('[data-test="edit-scope"]');
      expect(scope).not.toBeNull();
      expect(scope?.textContent).toContain("Affects 2 elements.");
      expect(host.shadowRoot?.querySelector('[data-test="selection"]')?.className)
        .not.toContain("selection--without-scope-callout");
    } finally {
      setSelectedElement(null);
      selected.remove();
      linked.remove();
    }
  });

  it("shows a group summary and exposes shared style controls for multi-selection", () => {
    const first = document.createElement("button");
    first.dataset.cid = "Heading";
    first.dataset.src = "fixtures/heading.tsx:1:1";
    const second = document.createElement("button");
    second.dataset.cid = "Heading";
    second.dataset.src = "fixtures/heading.tsx:1:1";
    document.body.append(first, second);

    try {
      act(() => {
        setSelectedElements([
          resolveSelectionFromElement(first)!,
          resolveSelectionFromElement(second)!,
        ]);
        mountInspector(host);
      });

      const shadow = host.shadowRoot!;
      expect(shadow.querySelector('[data-test="multi-selection-summary"]')?.textContent)
        .toContain("2 elements selected");
      expect(shadow.querySelector('[data-test="dom-navigation"]')).toBeNull();
      expect(shadow.querySelector('[data-test="component-props-section"]')).toBeNull();
      expect(shadow.querySelector('[data-test="layout-section"]')).not.toBeNull();
      expect(shadow.querySelector('[data-test="layout-size"]')).not.toBeNull();
      expect(shadow.querySelector('[data-test="spacing-box"]')).not.toBeNull();
      expect(shadow.querySelector('[data-test="appearance-section"]')).not.toBeNull();
      expect(shadow.querySelector('[data-test="typography"]')).not.toBeNull();
      expect(shadow.querySelector('[data-test="border-editor"]')).not.toBeNull();
      expect(shadow.querySelector('[data-test="box-shadow-editor"]')).not.toBeNull();
    } finally {
      setSelectedElement(null);
      first.remove();
      second.remove();
    }
  });

  it("disables partial group editing when repeated outputs are indistinguishable", () => {
    const elements = Array.from({ length: 3 }, () => {
      const element = document.createElement("button");
      element.dataset.cid = "Heading";
      element.dataset.src = "fixtures/heading.tsx:1:1";
      document.body.appendChild(element);
      return element;
    });

    try {
      act(() => {
        setSelectedElements(elements.slice(0, 2).map((element) => resolveSelectionFromElement(element)!));
        mountInspector(host);
      });

      const shadow = host.shadowRoot!;
      expect(shadow.querySelector('[data-test="multi-selection-summary"]')?.textContent)
        .toContain("2 elements selected");
      expect(shadow.querySelector('[data-test="multi-selection-uneditable"]')).not.toBeNull();
      expect(shadow.querySelector('[data-test="style-editors"]')).toBeNull();
    } finally {
      setSelectedElement(null);
      elements.forEach((element) => element.remove());
    }
  });

  it("hides DOM navigation unless the debug capability is enabled", () => {
    const previousConfig = getNudgeUiRuntimeConfig();
    const selected = document.createElement("button");
    selected.dataset.cid = "Selected";
    selected.dataset.src = "fixtures/selected.tsx:1:1";
    const child = document.createElement("span");
    child.dataset.cid = "Child";
    child.dataset.src = "fixtures/child.tsx:1:1";
    selected.appendChild(child);
    document.body.appendChild(selected);

    try {
      configureNudgeUiRuntime({
        ...previousConfig,
        capabilities: { ...previousConfig.capabilities, domNavigation: false },
      });
      act(() => {
        setSelectedElement(resolveSelectionFromElement(selected));
        mountInspector(host);
      });
      expect(host.shadowRoot?.querySelector('[data-test="dom-navigation"]')).toBeNull();
    } finally {
      setSelectedElement(null);
      selected.remove();
      configureNudgeUiRuntime(previousConfig);
    }
  });

  it("keeps session clearing below the changes accordion when changes are present", () => {
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
      mountInspector(host);
    });
    const shadow = host.shadowRoot!;
    expect(shadow.querySelector('[data-test="session-actions"]')?.previousElementSibling?.matches(".changes")).toBe(true);
    expect(shadow.querySelector('[data-test="clear-session"]')?.textContent).toBe("Clear Changes");
    expect(shadow.querySelector(".panel__session-actions")).toBeNull();

    act(() => {
      (shadow.querySelector('[data-test="clear-session"]') as HTMLButtonElement).click();
    });
    expect(host.shadowRoot?.querySelector('[data-test="changes-log"]')).toBeNull();
    expect(host.shadowRoot?.querySelector('[data-test="clear-session"]')).toBeNull();
  });

  it("shows selection guidance and shortcuts when nothing is selected", () => {
    act(() => {
      mountInspector(host);
    });

    const emptyState = host.shadowRoot?.querySelector('[data-test="empty-state"]');
    expect(emptyState?.querySelector(".empty-state__title")?.textContent).toBe("Select an element to edit");
    expect(host.shadowRoot?.querySelector('[data-test="changes-log"]')).toBeNull();
    const macPlatform = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
    const modifierKey = macPlatform ? "⌘" : "Ctrl";
    const optionKey = macPlatform ? "⌥" : "Alt";
    expect([...emptyState?.querySelectorAll<HTMLElement>('[data-test="empty-state-shortcut"]') ?? []].map((row) => row.textContent?.trim())).toEqual([
      "Nudge↑↓←→",
      "Big Nudge (8px)Shift+Arrow",
      `Select deeper${modifierKey}+Click`,
      `Measure${optionKey}+Hover`,
      `Hide UI${modifierKey}+\\`,
      "Hold to view original\\",
      `Undo${modifierKey}+Z`,
      "DeselectEsc",
    ]);
  });

  it("keeps the iframe workspace active without a page-mode switch", () => {
    setCanvasMode("canvas");
    act(() => {
      mountInspector(host);
    });
    const shadow = host.shadowRoot!;

    expect(shadow.querySelector('[data-test="mode-canvas"]')).toBeNull();
    expect(shadow.querySelector('[data-test^="presentation-"]')).toBeNull();
    expect(shadow.querySelector('[data-test="canvas-workspace"]')).not.toBeNull();
    expect(shadow.querySelector('[data-test="copy-prompt-control"]')).not.toBeNull();
    expect(shadow.querySelector('[data-test="settings-button"]')).not.toBeNull();
    expect(shadow.querySelector('[data-test="copy-prompt-menu"]')).toBeNull();
  });

  it("omits Canvas entry points when the host disables the capability", () => {
    const previousConfig = getNudgeUiRuntimeConfig();
    try {
      configureNudgeUiRuntime({
        ...previousConfig,
        host: "static-html",
        framework: "HTML",
        capabilities: { canvas: false, componentSemantics: false },
      });
      act(() => {
        mountInspector(host);
      });

      const shadow = host.shadowRoot!;
      expect(shadow.querySelector('[data-test="mode-canvas"]')).toBeNull();
        expect(shadow.querySelector('[data-test="canvas-workspace"]')).toBeNull();
    } finally {
      configureNudgeUiRuntime(previousConfig);
    }
  });



  it("Alt+I toggles the panel's data-open attribute", () => {
    act(() => {
      mountInspector(host);
    });
    const shadow = host.shadowRoot!;
    const panel = shadow.querySelector(".panel")!;
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
      (shadow.querySelector('[data-test="tokens-button"]') as HTMLButtonElement).click();
    });
    act(() => {
      (shadow.querySelector('[data-test="settings-nav-tokens"]') as HTMLButtonElement).click();
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
      (host.shadowRoot!.querySelector('[data-test="tokens-button"]') as HTMLButtonElement).click();
    });
    act(() => {
      host.shadowRoot!.querySelector<HTMLButtonElement>('[data-test="settings-nav-tokens"]')!.click();
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

  it("clears the selected element on Escape", () => {
    const selected = document.createElement("div");
    selected.setAttribute("data-cid", "Selected");
    selected.setAttribute("data-src", "src/Selected.tsx:1:1");
    document.body.append(selected);

    try {
      act(() => {
        setSelectedElement(resolveSelectionFromElement(selected));
        mountInspector(host);
      });
      expect(getSelectedElement()?.domElement).toBe(selected);

      let event: KeyboardEvent;
      act(() => {
        event = pressKey({ key: "Escape" });
      });

      expect(getSelectedElement()).toBeNull();
      expect(host.shadowRoot?.querySelector('[data-test="empty-state"]')).not.toBeNull();
      expect(event!.defaultPrevented).toBe(true);
    } finally {
      setSelectedElement(null);
      selected.remove();
    }
  });

  it("collapses from the header and restores through the floating icon button", () => {
    act(() => {
      mountInspector(host);
    });
    const shadow = host.shadowRoot!;
    const panel = shadow.querySelector(".panel")!;
    const header = shadow.querySelector('[data-test="inspect-tab"]') as HTMLElement;
    const collapse = shadow.querySelector('[data-test="collapse-inspector"]') as HTMLButtonElement;
    expect(collapse.getAttribute("aria-label")).toBe("Collapse inspector");
    expect(header.style.marginLeft).toBe("");
    expect(collapse.style.marginLeft).toBe("-8px");

    act(() => collapse.click());
    expect(panel.getAttribute("data-open")).toBe("false");

    const show = shadow.querySelector('[data-test="show-inspector"]') as HTMLButtonElement;
    expect(show.getAttribute("aria-label")).toBe("Show inspector");
    act(() => show.click());
    expect(panel.getAttribute("data-open")).toBe("true");
  });

  it("non-Alt+I keys do not toggle", () => {
    act(() => {
      mountInspector(host);
    });
    const shadow = host.shadowRoot!;
    const panel = shadow.querySelector(".panel")!;
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
    const panel = shadow.querySelector(".panel")!;
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
      (shadow.querySelector('[data-test="tokens-button"]') as HTMLButtonElement).click();
    });
    act(() => {
      shadow.querySelector<HTMLButtonElement>('[data-test="settings-nav-tokens"]')!.click();
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

  it("preserves workspace changes across mounted inspector lifetimes", () => {
    expect(appendChange({
      cid: "Button",
      file: "src/Button.tsx",
      line: 1,
      selector: '[data-cid="Button"]',
      property: "color",
      oldToken: null,
      newToken: null,
      rawValue: "red",
      source: { file: "src/Button.tsx", line: 1, component: "Button" },
    })).toBe("applied");
    expect(getChangesList()).toHaveLength(1);

    act(() => {
      mountInspector(host);
      expect(getChangesList()).toHaveLength(1);
      unmountInspector();
    });

    expect(getChangesList()).toHaveLength(1);

    act(() => {
      mountInspector(host);
    });
    expect(getChangesList()).toHaveLength(1);
  });
});
