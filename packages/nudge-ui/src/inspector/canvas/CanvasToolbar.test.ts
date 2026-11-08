import { describe, expect, it } from "vitest";
import { adjacentCanvasZoomLevel, closestCanvasZoomLevel } from "./CanvasToolbar.tsx";
import { canvasZoomLabel } from "./CanvasZoomMenu.tsx";
import { APP_INTERACTION_KEY, canvasToolForCode, canvasToolForEvent, canvasZoomStepForEvent, inspectionViewForCode } from "./keyboardShortcuts.ts";

describe("canvas toolbar zoom presets", () => {
  it("snaps arbitrary canvas zoom to the nearest preset", () => {
    expect(closestCanvasZoomLevel(0.82)).toBe(0.9);
    expect(closestCanvasZoomLevel(0.68)).toBe(0.5);
  });

  it("steps through presets and stops at each end", () => {
    expect(adjacentCanvasZoomLevel(0.9, -1)).toBe(0.5);
    expect(adjacentCanvasZoomLevel(0.9, 1)).toBe(1);
    expect(adjacentCanvasZoomLevel(1, 1)).toBe(1.5);
    expect(adjacentCanvasZoomLevel(0.7, 1)).toBe(0.9);
    expect(adjacentCanvasZoomLevel(0.7, -1)).toBe(0.5);
    expect(adjacentCanvasZoomLevel(0.25, -1)).toBeNull();
    expect(adjacentCanvasZoomLevel(3, 1)).toBeNull();
  });

  it("labels Focus as 100% whatever the Canvas camera", () => {
    expect(canvasZoomLabel("canvas", 0.9)).toBe("90%");
    expect(canvasZoomLabel("focus", 0.5)).toBe("100%");
  });
});

describe("canvas toolbar keyboard shortcuts", () => {
  it.each([
    ["KeyV", "design"],
    ["KeyC", "comment"],
    ["KeyP", "sketch"],
    ["KeyD", "debug"],
    ["KeyO", "debug"],
    ["KeyX", "debug"],
  ])("maps %s to the corresponding tool", (code, tool) => {
    expect(canvasToolForCode(code)).toBe(tool);
  });

  it.each([
    ["KeyD", null],
    ["KeyO", "outlines"],
    ["KeyX", "explode"],
  ])("maps %s to the %s view", (code, view) => {
    expect(inspectionViewForCode(code)).toBe(view);
  });

  it("maps the zoom chords with either modifier, shifted or on the keypad", () => {
    const chord = (code: string, keys: { metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean } = { metaKey: true }) => (
      canvasZoomStepForEvent({ code, metaKey: false, ctrlKey: false, altKey: false, ...keys })
    );
    expect(chord("Equal")).toBe(1);
    expect(chord("NumpadAdd", { ctrlKey: true })).toBe(1);
    expect(chord("Minus")).toBe(-1);
    expect(chord("NumpadSubtract")).toBe(-1);
    expect(chord("Equal", {})).toBeNull();
    expect(chord("Equal", { metaKey: true, altKey: true })).toBeNull();
    expect(chord("KeyV")).toBeNull();
  });

  it("does not map the app interaction key to a canvas tool", () => {
    expect(canvasToolForCode(APP_INTERACTION_KEY)).toBeNull();
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
