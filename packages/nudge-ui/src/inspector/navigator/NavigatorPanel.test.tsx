// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { FlowDefinition } from "../../transport/flows.ts";
import { FramesView } from "./NavigatorPanel.tsx";
import { resetCollapsed } from "./collapseStore.ts";

const checkout: FlowDefinition = {
  version: 1,
  id: "checkout",
  title: "Checkout",
  states: [{ id: "cart", label: "Cart", route: "/cart" }],
  edges: [],
};

vi.mock("../flows/flowsStore.ts", () => ({
  useFlows: () => ({ load: "ready", flows: [checkout], errors: [], status: [], replaying: new Set() }),
  flowStatusFor: () => undefined,
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("FramesView", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(createElement(FramesView)));
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    act(() => resetCollapsed());
  });

  const controlled = (toggle: HTMLElement): HTMLElement => {
    const element = host.ownerDocument.getElementById(toggle.getAttribute("aria-controls") ?? "");
    if (!element) throw new Error("Missing the toggled region");
    return element;
  };

  const query = (selector: string): HTMLElement => {
    const element = host.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing ${selector}`);
    return element;
  };

  it.each(["flows", "pages", "layers"])("folds the %s section from its title", (id) => {
    const toggle = query(`[data-test="navigator-section-toggle-${id}"]`);
    const body = controlled(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(body.hidden).toBe(false);

    act(() => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(body.hidden).toBe(true);

    act(() => toggle.click());
    expect(body.hidden).toBe(false);
  });

  it("keeps a folded section folded when the view mounts again", () => {
    act(() => query('[data-test="navigator-section-toggle-layers"]').click());
    act(() => root.unmount());
    root = createRoot(host);
    act(() => root.render(createElement(FramesView)));
    expect(query('[data-test="navigator-section-toggle-layers"]').getAttribute("aria-expanded")).toBe("false");
  });

  it("starts each flow folded and opens its states from the title", () => {
    const expander = query('[data-test="flows-flow"][data-flow-id="checkout"] [data-test="flows-expander"]');
    const states = controlled(expander);
    expect(states.querySelector('[data-test="flows-state"]')).not.toBeNull();
    expect(expander.getAttribute("aria-expanded")).toBe("false");
    expect(states.hidden).toBe(true);

    act(() => expander.click());
    expect(expander.getAttribute("aria-expanded")).toBe("true");
    expect(states.hidden).toBe(false);

    act(() => expander.click());
    expect(states.hidden).toBe(true);
  });
});
