import { describe, expect, it } from "vitest";
import { adjacentCanvasZoomLevel, closestCanvasZoomLevel } from "./CanvasToolbar.tsx";
import { canvasToolForCode, canvasToolForEvent } from "./keyboardShortcuts.ts";

describe("canvas toolbar zoom presets", () => {
  it("snaps arbitrary canvas zoom to the nearest preset", () => {
    expect(closestCanvasZoomLevel(0.82)).toBe(0.9);
    expect(closestCanvasZoomLevel(0.68)).toBe(0.5);
  });

  it("steps through presets and stops at each end", () => {
    expect(adjacentCanvasZoomLevel(0.9, -1)).toBe(0.5);
    expect(adjacentCanvasZoomLevel(0.9, 1)).toBe(1);
    expect(adjacentCanvasZoomLevel(0.25, -1)).toBeNull();
    expect(adjacentCanvasZoomLevel(1, 1)).toBeNull();
  });
});

describe("canvas toolbar keyboard shortcuts", () => {
  it.each([
    ["KeyI", "select"],
    ["KeyV", "design"],
    ["KeyH", "pan"],
    ["KeyP", "sketch"],
  ])("maps %s to the corresponding tool", (code, tool) => {
    expect(canvasToolForCode(code)).toBe(tool);
  });

  it("ignores modifiers and repeated keydown events", () => {
    const event = (overrides: Partial<KeyboardEvent>): KeyboardEvent => ({
      code: "",
      repeat: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      ...overrides,
    } as KeyboardEvent);
    expect(canvasToolForEvent(event({ code: "KeyV", shiftKey: true }))).toBeNull();
    expect(canvasToolForEvent(event({ code: "KeyH", repeat: true }))).toBeNull();
    expect(canvasToolForEvent(event({ code: "KeyP" }))).toBe("sketch");
  });
});
