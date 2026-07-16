// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { mountInspector, unmountInspector } from "./index.ts";

// Signal to React that the surrounding test environment supports act().
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function pressKey(key: string, altKey: boolean): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, altKey, bubbles: true }));
}

describe("InspectorShell", () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement("div");
    host.id = "design-tool-root";
    document.body.appendChild(host);
  });

  afterEach(() => {
    unmountInspector();
    host.remove();
  });

  it("mountInspector attaches a shadow root to the host element", () => {
    act(() => {
      mountInspector(host);
    });
    expect(host.shadowRoot).not.toBeNull();
  });

  it("renders the shell text inside the shadow root", () => {
    act(() => {
      mountInspector(host);
    });
    const shadow = host.shadowRoot!;
    expect(shadow.textContent).toContain("Inspector shell ready");
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
  });

  it("unmountInspector clears the React tree from the shadow root", () => {
    act(() => {
      mountInspector(host);
    });
    const shadow = host.shadowRoot!;
    expect(shadow.textContent).toContain("Inspector shell ready");
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
      pressKey("i", true);
    });
    const first = panel.getAttribute("data-open");
    expect(first).not.toBe(before);

    act(() => {
      pressKey("i", true);
    });
    const second = panel.getAttribute("data-open");
    expect(second).toBe(before);
  });

  it("non-Alt+I keys do not toggle", () => {
    act(() => {
      mountInspector(host);
    });
    const shadow = host.shadowRoot!;
    const panel = shadow.querySelector(".dt-panel")!;
    const before = panel.getAttribute("data-open");

    act(() => {
      pressKey("i", false);
      pressKey("a", true);
      pressKey("I", false);
    });
    expect(panel.getAttribute("data-open")).toBe(before);
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
    expect(host2.shadowRoot!.textContent).toContain("Inspector shell ready");
    host2.remove();
  });
});
