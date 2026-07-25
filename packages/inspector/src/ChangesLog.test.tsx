// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { ChangesLog } from "./ChangesLog.tsx";
import { appendChange, clearChanges } from "./changesLog.ts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ChangesLog", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    clearChanges();
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
    expect(details.querySelector('[data-test="change-row"]')?.querySelector(".dt-changes__value")).not.toBeNull();

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
    expect(actions.querySelector('[data-test="clear-session"]')?.textContent).toBe("Clear Session");
  });
});
