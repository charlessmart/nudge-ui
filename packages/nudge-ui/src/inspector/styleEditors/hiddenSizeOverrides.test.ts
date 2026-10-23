// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { hasChildPlacementOverrides, hasSizeOverride } from "./hiddenSizeOverrides.ts";
import { makeSelected, mockComputedStyle, restoreComputedStyle } from "./_testUtils.ts";

const NEITHER = { flexChild: false, gridChild: false };

describe("hasSizeOverride", () => {
  afterEach(() => {
    restoreComputedStyle();
    document.body.innerHTML = "";
  });

  it("is false for min, max and aspect ratio at their initial values", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "min-width": "0px", "min-height": "auto", "max-width": "none", "max-height": "none", "aspect-ratio": "auto" });

    for (const property of ["min-width", "min-height", "max-width", "max-height", "aspect-ratio"] as const) {
      expect(hasSizeOverride(el, property)).toBe(false);
    }
  });

  it("is true only for the property that is authored", () => {
    const { el } = makeSelected();
    el.style.maxWidth = "640px";
    mockComputedStyle({});
    expect(hasSizeOverride(el, "max-width")).toBe(true);
    expect(hasSizeOverride(el, "max-height")).toBe(false);

    el.style.maxWidth = "";
    el.style.aspectRatio = "16 / 9";
    expect(hasSizeOverride(el, "aspect-ratio")).toBe(true);
    expect(hasSizeOverride(el, "max-width")).toBe(false);
  });
});

describe("hasChildPlacementOverrides", () => {
  afterEach(() => {
    restoreComputedStyle();
    document.body.innerHTML = "";
  });

  it("looks at flex child properties only inside a flex parent", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "flex-grow": "1", "flex-shrink": "1", "flex-basis": "auto", "align-self": "auto", order: "0" });

    expect(hasChildPlacementOverrides(el, NEITHER)).toBe(false);
    expect(hasChildPlacementOverrides(el, { flexChild: true, gridChild: false })).toBe(true);
  });

  it("treats the default flex values and a normal self-alignment as unchanged", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "flex-grow": "0", "flex-shrink": "1", "flex-basis": "auto", "align-self": "normal", order: "0" });

    expect(hasChildPlacementOverrides(el, { flexChild: true, gridChild: false })).toBe(false);
  });

  it("flags a grid child that is placed or aligned", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "grid-column-start": "2", "grid-column-end": "auto", "grid-row-start": "auto", "grid-row-end": "auto", "justify-self": "auto", "align-self": "auto" });

    expect(hasChildPlacementOverrides(el, { flexChild: false, gridChild: true })).toBe(true);
  });
});
