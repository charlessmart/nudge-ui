// @vitest-environment jsdom
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BackgroundEditor } from "./BackgroundEditor.tsx";
import { getChangeRecords, resetPendingRules } from "../tokens/editActions.ts";
import { makeSelected, mount, mockComputedStyle, restoreComputedStyle, setInputValue, setSelectValue, sheetText } from "./_testUtils.ts";
import type { MountHandle } from "./_testUtils.ts";

let handle: MountHandle;
beforeEach(() => { resetPendingRules(); document.body.innerHTML = ""; });
afterEach(() => { handle?.unmount(); restoreComputedStyle(); resetPendingRules(); document.body.innerHTML = ""; });

function button(label: string): HTMLButtonElement { return handle.host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!; }
function input(label: string): HTMLInputElement { return handle.host.querySelector<HTMLInputElement>(`[data-test="token-field"][aria-label="${label}"] input[data-test="raw-input"]`)!; }

describe("BackgroundEditor", () => {
  it("keeps an empty background section compact until its add button is opened", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "background-image": "none", "background-color": "rgba(0, 0, 0, 0)" });
    handle = mount(createElement(BackgroundEditor, { element: selected, tokenRow: {
      property: "background-color", authored: "transparent", declaredValue: "transparent",
      resolvedValue: "rgba(0, 0, 0, 0)", tokenName: null, confidence: "exact", evidence: { reason: "test" },
    } }));
    expect(button("Solid")).toBeNull();
    expect(handle.host.querySelector('[data-test="token-field"]')).toBeNull();
    act(() => button("Add Background Color").click());
    expect(button("Solid")).not.toBeNull();
    expect(handle.host.querySelector('[data-property="background-color"] [data-test="token-field"]')).not.toBeNull();
    act(() => button("Remove Background Color").click());
    expect(button("Solid")).toBeNull();
    expect(button("Add Background Color")).not.toBeNull();
  });

  it("returns to an empty section when the only background image is removed", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "background-image": "linear-gradient(red, blue)", "background-color": "transparent" });
    handle = mount(createElement(BackgroundEditor, { element: selected }));
    act(() => button("Remove background image").click());
    expect(button("Gradient")).toBeNull();
    expect(input("Background image CSS")).toBeNull();
    expect(button("Add Background Color")).not.toBeNull();
    expect(sheetText()).toContain("background-image: none");
  });

  it("inspects a computed gradient and records angle edits as background-image", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "background-image": "linear-gradient(35deg, rgb(255, 0, 0) 20%, rgba(0, 0, 255, 0.4) 85%)" });
    handle = mount(createElement(BackgroundEditor, { element: selected }));
    expect(button("Gradient").getAttribute("aria-pressed")).toBe("true");
    expect(input("Gradient angle").value).toBe("35deg");
    expect(input("Stop 2 position").value).toBe("85%");
    setInputValue(input("Gradient angle"), "125");
    expect(sheetText()).toContain("linear-gradient(125deg, rgb(255, 0, 0) 20%, rgba(0, 0, 255, 0.4) 85%)");
    expect(getChangeRecords().at(-1)?.property).toBe("background-image");
  });

  it("adds, moves, and removes stops while retaining at least two", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "background-image": "linear-gradient(90deg, red 0%, blue 100%)" });
    handle = mount(createElement(BackgroundEditor, { element: selected }));
    expect(button("Remove stop 1").disabled).toBe(true);
    act(() => button("Add gradient stop").click());
    setInputValue(input("Stop 3 position"), "72");
    expect(sheetText()).toContain("red 72%");
    act(() => button("Remove stop 3").click());
    expect(input("Stop 3 position")).toBeNull();
    expect(getChangeRecords()).toHaveLength(0);
    expect(input("Stop 1 position").value).toBe("0%");
    expect(input("Stop 2 position").value).toBe("100%");
  });

  it("changes gradient type and reverses colors", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "background-image": "linear-gradient(60deg, red 0%, blue 100%)" });
    handle = mount(createElement(BackgroundEditor, { element: selected }));
    setSelectValue(button("Gradient type"), "conic");
    act(() => button("Reverse gradient").click());
    expect(sheetText()).toContain("conic-gradient(from 60deg, blue 0%, red 100%)");
  });

  it("switches to solid by clearing the image layer", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "background-image": "linear-gradient(red, blue)", "background-color": "rgb(255, 255, 255)" });
    handle = mount(createElement(BackgroundEditor, { element: selected }));
    act(() => button("Solid").click());
    expect(sheetText()).toContain("background-image: none");
    expect(input("Gradient angle")).toBeNull();
    expect(handle.host.querySelector('[data-property="background-color"]')).not.toBeNull();
  });

  it("preserves layered backgrounds in a CSS field", () => {
    const { selected } = makeSelected();
    const value = "linear-gradient(red, blue), url(example.png)";
    mockComputedStyle({ "background-image": value });
    handle = mount(createElement(BackgroundEditor, { element: selected }));
    expect(input("Background image CSS").value).toBe(value);
    expect(getChangeRecords()).toHaveLength(0);
  });

  it("blocks edits when an inline background shorthand owns the cascade", () => {
    const { selected, el } = makeSelected();
    el.style.background = "red";
    mockComputedStyle({ "background-image": "linear-gradient(red, blue)" });
    handle = mount(createElement(BackgroundEditor, { element: selected }));
    expect(button("Solid").disabled).toBe(true);
    expect(button("Add gradient stop").disabled).toBe(true);
    expect(input("Gradient angle").disabled).toBe(true);
    expect(getChangeRecords()).toHaveLength(0);
  });

  it("reads a newly selected element instead of carrying the previous gradient draft", () => {
    const first = makeSelected("First", "src/First.tsx:1:1");
    mockComputedStyle({ "background-image": "linear-gradient(red, blue)" });
    handle = mount(createElement(BackgroundEditor, { element: first.selected }));
    setInputValue(input("Gradient angle"), "25");
    const second = makeSelected("Second", "src/Second.tsx:1:1");
    mockComputedStyle({ "background-image": "url(other.png)" });
    act(() => handle.root.render(createElement(BackgroundEditor, { element: second.selected })));
    expect(button("Image").getAttribute("aria-pressed")).toBe("true");
    expect(handle.host.querySelector<HTMLImageElement>(".image-background__thumb")?.getAttribute("src")).toBe("other.png");
  });

  it("selects a stop color token and unlinks it without losing opacity", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "background-image": "linear-gradient(90deg, rgba(255, 0, 0, 0.4) 0%, blue 100%)" });
    handle = mount(createElement(BackgroundEditor, {
      element: selected,
      entries: [{ name: "--color-ocean", value: "#0088cc", source: "test.css:1" }],
    }));
    setInputValue(input("Stop 1 color"), "var(--color-ocean)");
    expect(sheetText()).toContain("color-mix(in srgb, var(--color-ocean) 40%, transparent) 0%");
    const colorField = handle.host.querySelector('[data-test="token-field"][aria-label="Stop 1 color"]')!;
    expect(colorField.querySelector('[data-test="token-chip"]')?.textContent).toContain("--color-ocean");
    act(() => colorField.querySelector<HTMLButtonElement>('[data-test="delink-btn"]')!.click());
    expect(sheetText()).toContain("rgb(0 136 204 / 40%) 0%");
    expect(colorField.querySelector('[data-test="token-chip"]')).toBeNull();
  });

});
