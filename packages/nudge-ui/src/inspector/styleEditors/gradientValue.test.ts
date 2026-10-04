import { describe, expect, it } from "vitest";
import { parseGradient, serializeGradient } from "./gradientValue.ts";

describe("computed gradient editing", () => {
  it("distributes omitted stops and preserves functional colors and alpha", () => {
    const gradient = parseGradient("linear-gradient(to right, rgb(255, 0, 0), rgba(0, 255, 0, 0.5), rgb(0, 0, 255))")!;
    expect(gradient.stops).toEqual([
      { color: "rgb(255, 0, 0)", position: 0 },
      { color: "rgba(0, 255, 0, 0.5)", position: 50 },
      { color: "rgb(0, 0, 255)", position: 100 },
    ]);
    expect(serializeGradient(gradient)).toBe("linear-gradient(90deg, rgb(255, 0, 0) 0%, rgba(0, 255, 0, 0.5) 50%, rgb(0, 0, 255) 100%)");
  });

  it("preserves radial geometry, repetition, and double-position stops", () => {
    const gradient = parseGradient("repeating-radial-gradient(ellipse farthest-corner at 25% 70%, red 10% 30%, blue 60%)")!;
    expect(serializeGradient(gradient)).toBe("repeating-radial-gradient(ellipse farthest-corner at 25% 70%, red 10%, red 30%, blue 60%)");
  });

  it("converts conic angle units and keeps its origin", () => {
    const gradient = parseGradient("conic-gradient(from .25turn at 30% 40%, red 0deg, blue 180deg, red 1turn)")!;
    expect(serializeGradient(gradient)).toBe("conic-gradient(from 90deg at 30% 40%, red 0%, blue 50%, red 100%)");
  });

  it("uses CSS stop fixup without clamping valid out-of-range positions", () => {
    const gradient = parseGradient("linear-gradient(30deg, red -20%, green, blue 10%, white 5%, black 120%)")!;
    expect(gradient.stops.map((stop) => stop.position)).toEqual([-20, -5, 10, 10, 120]);
  });

  it.each([
    "linear-gradient(red, blue), url(image.png)",
    "linear-gradient(red 10px, blue 90px)",
    "linear-gradient(red, 30%, blue)",
    "linear-gradient(to top right, red, blue)",
    "linear-gradient(calc(20deg + 10deg), red, blue)",
  ])("leaves unsupported CSS unchanged for raw editing: %s", (value) => {
    expect(parseGradient(value)).toBeNull();
  });
});
