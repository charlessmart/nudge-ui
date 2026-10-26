// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ColorPickerPanel } from "./ColorPickerPanel.tsx";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

function render(value: string, onChange = vi.fn()): HTMLElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(createElement(ColorPickerPanel, { value, onChange })));
  return host;
}

function type(input: HTMLInputElement, text: string): void {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
}

function cells(element: HTMLElement): string[] {
  return Array.from(element.querySelectorAll<HTMLInputElement>(".color-picker__cell"), (cell) => cell.value);
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("ColorPickerPanel", () => {
  it("opens in the authored format with its channels and opacity", () => {
    const element = render("hsl(0 0% 85% / 50%)");
    expect(element.querySelector('[data-test="color-picker-channels"]')?.getAttribute("data-format")).toBe("hsl");
    expect(cells(element)).toEqual(["0", "0", "85", "50"]);
    expect(element.querySelector('[data-test="color-picker-surface"]')?.getAttribute("data-model")).toBe("hsl");
  });

  it("writes a typed channel in the current format", () => {
    const onChange = vi.fn();
    const element = render("rgb(10 20 30)", onChange);
    type(element.querySelector<HTMLInputElement>('[data-test="color-picker-channel-0"]')!, "200");
    expect(onChange).toHaveBeenLastCalledWith("rgb(200 20 30)");
  });

  it("writes opacity into the color", () => {
    const onChange = vi.fn();
    const element = render("#336699", onChange);
    type(element.querySelector<HTMLInputElement>('[data-test="color-picker-alpha-input"]')!, "40");
    expect(onChange).toHaveBeenLastCalledWith("#33669966");
  });

  it("steps the hue and opacity sliders from the keyboard", () => {
    const onChange = vi.fn();
    const element = render("#ff0000", onChange);
    const hue = element.querySelector<HTMLElement>('[data-test="color-picker-hue"]')!;
    act(() => hue.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true })));
    expect(hue.getAttribute("aria-valuenow")).toBe("10");
    expect(onChange).toHaveBeenLastCalledWith("#ff2a00");
    const alpha = element.querySelector<HTMLElement>('[data-test="color-picker-alpha"]')!;
    act(() => alpha.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
    expect(alpha.getAttribute("aria-valuetext")).toBe("99%");
  });

  it("follows an outside change without echoing it back", () => {
    const onChange = vi.fn();
    const element = render("#000000", onChange);
    act(() => root!.render(createElement(ColorPickerPanel, { value: "#00ff00", onChange })));
    expect(element.querySelector<HTMLInputElement>('[data-test="color-picker-hex"]')?.value).toBe("00FF00");
    expect(onChange).not.toHaveBeenCalled();
  });
});
