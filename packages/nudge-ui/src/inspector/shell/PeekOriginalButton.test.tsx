// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { mountInspector, unmountInspector } from "../index.ts";
import { appendChange, clearWorkspace } from "../changes/changesLog.ts";
import { acquireLease, releaseLease } from "../canvas/workspaceLease.ts";
import { isOriginalPreviewActive, setOriginalPreviewActive } from "./originalPreview.ts";

// Signal to React that the surrounding test environment supports act().
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeRecord(property: string, rawValue: string) {
  return {
    cid: "Button",
    file: "src/Button.tsx",
    line: 1,
    selector: '[data-cid="Button"]',
    property,
    oldToken: null,
    newToken: null,
    rawValue,
    source: { file: "src/Button.tsx", line: 1, component: "Button" },
  };
}

function sheetText(): string {
  return document.getElementById("nudge-ui-styles")?.textContent ?? "";
}

describe("PeekOriginalButton", () => {
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
    // Reset any keyboard-held peek flag in the global shortcut handler.
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "\\", code: "Backslash", bubbles: true }));
    setOriginalPreviewActive(false);
    clearWorkspace();
    releaseLease();
    host.remove();
    document.getElementById("nudge-ui-styles")?.remove();
  });

  it("renders before the settings button and stays disabled without changes", () => {
    act(() => {
      mountInspector(host);
    });
    const shadow = host.shadowRoot!;
    const peek = shadow.querySelector<HTMLButtonElement>('[data-test="peek-original-button"]');
    expect(peek).not.toBeNull();
    expect(peek!.disabled).toBe(true);
    expect(peek!.getAttribute("aria-label")).toBe("Hold to view original");

    const actions = shadow.querySelector(".panel__header-actions")!;
    const order = [...actions.querySelectorAll("button")].map((button) => button.getAttribute("data-test"));
    expect(order).toContain("peek-original-button");
    expect(order).toContain("settings-button");
    expect(order).not.toContain("tokens-button");
    expect(order.indexOf("peek-original-button")).toBeLessThan(order.indexOf("settings-button"));
  });

  it("holding the button suspends the preview and releasing restores it", () => {
    act(() => {
      expect(appendChange(makeRecord("color", "red"))).toBe("applied");
      mountInspector(host);
    });
    const shadow = host.shadowRoot!;
    const peek = shadow.querySelector<HTMLButtonElement>('[data-test="peek-original-button"]')!;
    expect(peek.disabled).toBe(false);
    expect(sheetText()).toContain("red");

    act(() => {
      peek.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(sheetText()).toBe("");
    expect(peek.getAttribute("aria-pressed")).toBe("true");

    act(() => {
      peek.dispatchEvent(new Event("pointerup", { bubbles: true }));
    });
    expect(sheetText()).toContain("red");
    expect(peek.getAttribute("aria-pressed")).toBe("false");
  });

  it("holding backslash suspends the preview and releasing restores it", () => {
    act(() => {
      expect(appendChange(makeRecord("color", "red"))).toBe("applied");
      mountInspector(host);
    });
    expect(sheetText()).toContain("red");

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "\\", code: "Backslash", bubbles: true, cancelable: true }));
    });
    expect(isOriginalPreviewActive()).toBe(true);
    expect(sheetText()).toBe("");

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "\\", code: "Backslash", bubbles: true, cancelable: true }));
    });
    expect(isOriginalPreviewActive()).toBe(false);
    expect(sheetText()).toContain("red");
  });

  it("ignores backslash typed into editable elements", () => {
    act(() => {
      expect(appendChange(makeRecord("color", "red"))).toBe("applied");
      mountInspector(host);
    });
    const input = document.createElement("input");
    document.body.appendChild(input);
    try {
      act(() => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "\\", code: "Backslash", bubbles: true, cancelable: true }));
      });
      expect(isOriginalPreviewActive()).toBe(false);
      expect(sheetText()).toContain("red");
    } finally {
      input.remove();
    }
  });

  it("keeps a button-held peek across the panel toggle shortcut", () => {
    act(() => {
      expect(appendChange(makeRecord("color", "red"))).toBe("applied");
      mountInspector(host);
    });
    const shadow = host.shadowRoot!;
    const peek = shadow.querySelector<HTMLButtonElement>('[data-test="peek-original-button"]')!;
    act(() => {
      peek.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(isOriginalPreviewActive()).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "\\", code: "Backslash", metaKey: true, bubbles: true, cancelable: true }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "\\", code: "Backslash", metaKey: true, bubbles: true, cancelable: true }));
    });
    // The keyboard never started this peek, so its keyup must not end it.
    expect(isOriginalPreviewActive()).toBe(true);
    expect(sheetText()).toBe("");

    act(() => {
      peek.dispatchEvent(new Event("pointerup", { bubbles: true }));
    });
    expect(isOriginalPreviewActive()).toBe(false);
    expect(sheetText()).toContain("red");
  });

  it("shift+backslash toggles the panel without starting the preview", () => {
    act(() => {
      expect(appendChange(makeRecord("color", "red"))).toBe("applied");
      mountInspector(host);
    });
    const panel = host.shadowRoot!.querySelector(".panel")!;
    const before = panel.getAttribute("data-open");

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "|", code: "Backslash", shiftKey: true, bubbles: true, cancelable: true }));
    });
    expect(isOriginalPreviewActive()).toBe(false);
    expect(sheetText()).toContain("red");
    expect(panel.getAttribute("data-open")).not.toBe(before);
  });
});
