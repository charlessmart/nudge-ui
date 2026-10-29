// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { configureInspectorStorage } from "../runtime/inspectorStorage.ts";
import { mount, type MountHandle } from "../styleEditors/_testUtils.ts";
import { InspectorPanel } from "./InspectorPanel.tsx";
import {
  MIN_PANEL_WIDTH,
  applyPanelWidth,
  clampPanelWidth,
  readStoredPanelWidth,
  storePanelWidth,
} from "./panelWidth.ts";

describe("panel width", () => {
  let handle: MountHandle | undefined;

  afterEach(() => {
    handle?.unmount();
    handle = undefined;
    document.body.innerHTML = "";
    document.documentElement.style.removeProperty("--panel-width");
    configureInspectorStorage(null);
  });

  it("keeps the width between the minimum and what leaves room for the page", () => {
    expect(clampPanelWidth(100, 1440)).toBe(MIN_PANEL_WIDTH);
    expect(clampPanelWidth(5000, 1440)).toBe(720);
    expect(clampPanelWidth(5000, 800)).toBe(520);
    expect(clampPanelWidth(400.4, 1440)).toBe(400);
  });

  it("round-trips through inspector storage and clears on reset", () => {
    const values = new Map<string, string>();
    configureInspectorStorage({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); },
    });
    expect(readStoredPanelWidth(1440)).toBeNull();
    storePanelWidth(412);
    expect(readStoredPanelWidth(1440)).toBe(412);
    storePanelWidth(null);
    expect(readStoredPanelWidth(1440)).toBeNull();
  });

  it("applies and removes the width variable", () => {
    applyPanelWidth(document.documentElement, 400);
    expect(document.documentElement.style.getPropertyValue("--panel-width")).toBe("400px");
    applyPanelWidth(document.documentElement, null);
    expect(document.documentElement.style.getPropertyValue("--panel-width")).toBe("");
  });

  it("offers a resize handle only while the panel is open, restoring a saved width", () => {
    configureInspectorStorage({ getItem: () => "450", setItem: () => undefined, removeItem: () => undefined });
    const props = { headerActions: null, prompt: null, onOpenChange: () => undefined, children: null };
    handle = mount(createElement(InspectorPanel, { ...props, isOpen: true }));

    expect(handle.host.querySelector('[data-test="panel-resize"]')?.getAttribute("role")).toBe("separator");
    expect(document.documentElement.style.getPropertyValue("--panel-width")).toBe("450px");

    handle.unmount();
    handle = mount(createElement(InspectorPanel, { ...props, isOpen: false }));
    expect(handle.host.querySelector('[data-test="panel-resize"]')).toBeNull();
  });
});
