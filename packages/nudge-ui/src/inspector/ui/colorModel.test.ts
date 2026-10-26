import { describe, expect, it } from "vitest";
import {
  channelValues,
  colorAtSurface,
  formatCssColor,
  formatForValue,
  hsvaFromRgba,
  parseColorSyntax,
  surfacePosition,
  withChannel,
  type Hsva,
} from "./colorModel.ts";

const RED: Hsva = { h: 0, s: 1, v: 1, a: 1 };

describe("colorModel", () => {
  it("parses hex, rgb, hsl and srgb syntax with alpha", () => {
    expect(parseColorSyntax("#f00")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColorSyntax("#ff000080")?.a).toBeCloseTo(0.5, 2);
    expect(parseColorSyntax("rgba(10, 20, 30, 0.4)")).toEqual({ r: 10, g: 20, b: 30, a: 0.4 });
    expect(parseColorSyntax("rgb(10 20 30 / 40%)")).toEqual({ r: 10, g: 20, b: 30, a: 0.4 });
    expect(parseColorSyntax("hsl(120 100% 25%)")).toEqual({ r: 0, g: 128, b: 0, a: 1 });
    expect(parseColorSyntax("color(srgb 1 0.5 0 / 0.25)")).toEqual({ r: 255, g: 128, b: 0, a: 0.25 });
    expect(parseColorSyntax("var(--brand)")).toBeNull();
  });

  it("writes each format, adding alpha only when translucent", () => {
    expect(formatCssColor(RED, "hex")).toBe("#ff0000");
    expect(formatCssColor({ ...RED, a: 0.5 }, "hex")).toBe("#ff000080");
    expect(formatCssColor(RED, "rgb")).toBe("rgb(255 0 0)");
    expect(formatCssColor({ ...RED, a: 0.85 }, "hsl")).toBe("hsl(0 100% 50% / 85%)");
    expect(formatCssColor(RED, "hsb")).toBe("#ff0000");
  });

  it("shows and edits channels per format", () => {
    expect(channelValues(RED, "hsl")).toEqual([0, 100, 50]);
    expect(channelValues(RED, "hsb")).toEqual([0, 100, 100]);
    expect(formatCssColor(withChannel(RED, "hsl", 2, 25), "hex")).toBe("#800000");
    expect(formatCssColor(withChannel(RED, "rgb", 2, 255), "hex")).toBe("#ff00ff");
    expect(withChannel(RED, "hsb", 0, 999).h).toBe(0);
  });

  it("keeps hue through grey and black", () => {
    const blue: Hsva = { h: 240, s: 1, v: 1, a: 1 };
    expect(hsvaFromRgba({ r: 0, g: 0, b: 0, a: 1 }, blue)).toMatchObject({ h: 240, s: 1, v: 0 });
    expect(hsvaFromRgba({ r: 128, g: 128, b: 128, a: 1 }, blue)).toMatchObject({ h: 240, s: 0 });
  });

  it("maps the surface to saturation/brightness or saturation/lightness", () => {
    expect(surfacePosition(RED, "hsb")).toEqual({ x: 1, y: 0 });
    expect(surfacePosition(RED, "hsl")).toEqual({ x: 1, y: 0.5 });
    expect(formatCssColor(colorAtSurface(RED, "hsl", 0, 0), "hex")).toBe("#ffffff");
    expect(formatCssColor(colorAtSurface(RED, "hsb", 0, 1), "hex")).toBe("#000000");
  });

  it("opens in the authored value's format", () => {
    expect(formatForValue("hsl(0 0% 0%)")).toBe("hsl");
    expect(formatForValue("rgba(0,0,0,1)")).toBe("rgb");
    expect(formatForValue("oklch(50% 0.1 20)")).toBe("hex");
  });
});
