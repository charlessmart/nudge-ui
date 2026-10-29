// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_TOOLBAR_OFFSET,
  applyToolbarOffset,
  clampToolbarOffset,
  rememberToolbarOffset,
  rememberedToolbarOffset,
} from "./toolbarPosition.ts";

const viewport = { width: 1000, height: 700 };
const rect = { left: 400, right: 600, top: 620, bottom: 680 };

describe("toolbar position", () => {
  afterEach(() => {
    rememberToolbarOffset(DEFAULT_TOOLBAR_OFFSET);
    document.documentElement.removeAttribute("style");
  });

  it("keeps the toolbar inside the window with a margin", () => {
    expect(clampToolbarOffset({ x: -2000, y: -2000 }, { x: 0, y: 0 }, rect, viewport)).toEqual({ x: -392, y: -612 });
    expect(clampToolbarOffset({ x: 2000, y: 2000 }, { x: 0, y: 0 }, rect, viewport)).toEqual({ x: 392, y: 12 });
    expect(clampToolbarOffset({ x: 30, y: -40 }, { x: 0, y: 0 }, rect, viewport)).toEqual({ x: 30, y: -40 });
  });

  it("measures against where the toolbar is now, not the default spot", () => {
    const moved = { left: 100, right: 300, top: 100, bottom: 160 };
    expect(clampToolbarOffset({ x: -500, y: -520 }, { x: -300, y: -520 }, moved, viewport)).toEqual({ x: -392, y: -520 });
  });

  it("falls back to the default spot in a window too small to hold it", () => {
    expect(clampToolbarOffset({ x: 50, y: 50 }, { x: 20, y: 0 }, rect, { width: 150, height: 700 }).x).toBe(0);
  });

  it("writes the offset to the host and clears it at the default spot", () => {
    applyToolbarOffset(document.body, { x: 12, y: -30 });
    expect(document.documentElement.style.getPropertyValue("--canvas-toolbar-offset-x")).toBe("12px");
    expect(document.documentElement.style.getPropertyValue("--canvas-toolbar-offset-y")).toBe("-30px");
    applyToolbarOffset(document.body, { x: 0, y: 0 });
    expect(document.documentElement.style.getPropertyValue("--canvas-toolbar-offset-x")).toBe("");
  });

  it("remembers the offset in memory without touching storage", () => {
    rememberToolbarOffset({ x: -40, y: -200 });
    expect(rememberedToolbarOffset()).toEqual({ x: -40, y: -200 });
    expect(localStorage.length).toBe(0);
  });
});
