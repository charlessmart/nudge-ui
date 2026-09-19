import { describe, expect, it } from "vitest";
import { getSvgPathFromStroke, sketchStrokeOutline, sketchStrokePath } from "./freehand.tsx";

describe("freehand SVG geometry", () => {
  it("turns a centerline into a closed outline path", () => {
    const stroke = {
      kind: "freehand" as const,
      width: 6,
      points: [
        { x: 20, y: 24 },
        { x: 32, y: 30 },
        { x: 48, y: 42 },
        { x: 64, y: 40 },
      ],
    };

    const outline = sketchStrokeOutline(stroke);
    const path = sketchStrokePath(stroke);

    expect(outline.length).toBeGreaterThan(3);
    expect(path.startsWith("M ")).toBe(true);
    expect(path.endsWith(" Z")).toBe(true);
  });

  it("keeps rectangle sketches as line paths", () => {
    const path = sketchStrokePath({
      kind: "rectangle",
      width: 6,
      points: [
        { x: 10, y: 20 },
        { x: 80, y: 20 },
        { x: 80, y: 60 },
        { x: 10, y: 60 },
        { x: 10, y: 20 },
      ],
    });

    expect(path).toBe("M 10.00 20.00 L 80.00 20.00 L 80.00 60.00 L 10.00 60.00 L 10.00 20.00");
  });

  it("converts an outline polygon into a closed SVG path", () => {
    expect(getSvgPathFromStroke([[0, 0], [10, 0], [10, 10], [0, 10]])).toContain(" Z");
  });
});
