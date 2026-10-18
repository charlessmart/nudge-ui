// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { hasHiddenSizeOverrides } from "./hiddenSizeOverrides.ts";
import { makeSelected, mockComputedStyle, restoreComputedStyle } from "./_testUtils.ts";

const NEITHER = { flexChild: false, gridChild: false };

describe("hasHiddenSizeOverrides", () => {
  afterEach(() => {
    restoreComputedStyle();
    document.body.innerHTML = "";
  });

  it("is false when min, max and aspect ratio are at their initial values", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "min-width": "0px", "min-height": "auto", "max-width": "none", "max-height": "none", "aspect-ratio": "auto" });

    expect(hasHiddenSizeOverrides(el, NEITHER)).toBe(false);
  });

  it("is true for an authored max width or aspect ratio", () => {
    const { el } = makeSelected();
    el.style.maxWidth = "640px";
    mockComputedStyle({});
    expect(hasHiddenSizeOverrides(el, NEITHER)).toBe(true);

    el.style.maxWidth = "";
    el.style.aspectRatio = "16 / 9";
    expect(hasHiddenSizeOverrides(el, NEITHER)).toBe(true);
  });

  it("looks at flex child properties only inside a flex parent", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "flex-grow": "1", "flex-shrink": "1", "flex-basis": "auto", "align-self": "auto", order: "0" });

    expect(hasHiddenSizeOverrides(el, NEITHER)).toBe(false);
    expect(hasHiddenSizeOverrides(el, { flexChild: true, gridChild: false })).toBe(true);
  });

  it("treats the default flex values and a normal self-alignment as unchanged", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "flex-grow": "0", "flex-shrink": "1", "flex-basis": "auto", "align-self": "normal", order: "0" });

    expect(hasHiddenSizeOverrides(el, { flexChild: true, gridChild: false })).toBe(false);
  });

  it("flags a grid child that is placed or aligned", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "grid-column-start": "2", "grid-column-end": "auto", "grid-row-start": "auto", "grid-row-end": "auto", "justify-self": "auto", "align-self": "auto" });

    expect(hasHiddenSizeOverrides(el, { flexChild: false, gridChild: true })).toBe(true);
  });
});
