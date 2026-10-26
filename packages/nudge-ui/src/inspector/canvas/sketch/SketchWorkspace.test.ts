import { describe, expect, it } from "vitest";
import { projectLiveStrokes } from "./SketchWorkspace.tsx";
import type { SketchLiveDraft } from "./SketchWorkspace.tsx";
import type { CapturedSketch } from "../../sketch/capture.ts";
import type { SketchStroke } from "../../sketch/model.ts";
import { createTextStroke } from "../../sketch/text.ts";

const stroke: SketchStroke = {
  id: "stroke-1",
  kind: "freehand",
  width: 6,
  color: "#0096ff",
  points: [
    { x: 40, y: 40 },
    { x: 140, y: 40 },
  ],
};

const draft: SketchLiveDraft = {
  strokes: [stroke],
  viewport: {
    width: 100,
    height: 100,
    scrollX: 0,
    scrollY: 0,
    offsetX: 0,
    offsetY: 0,
    displayWidth: 100,
    displayHeight: 100,
  },
};

const captured: CapturedSketch = {
  pageImage: new Blob(["png"], { type: "image/png" }),
  imageWidth: 100,
  imageHeight: 100,
  capture: {
    url: "https://example.test/",
    title: "Example",
    timestamp: 1,
    viewportWidth: 100,
    viewportHeight: 100,
    scrollX: 0,
    scrollY: 0,
    devicePixelRatio: 1,
    host: "vite-react",
    framework: "React",
    imageWidth: 100,
    imageHeight: 100,
  },
};

describe("projectLiveStrokes", () => {
  it("does not turn points outside the captured viewport into edge marks", () => {
    expect(projectLiveStrokes(draft, captured)).toEqual([{
      ...stroke,
      points: [{ x: 40, y: 40 }],
    }]);
  });

  it("scales type with the capture and keeps a fully visible text layer whole", () => {
    const layer = createTextStroke({ id: "text-1", corner: { x: 10, y: 10 }, text: "Hi", fontSize: 20, color: "#0096ff" });
    const [projected] = projectLiveStrokes({ ...draft, strokes: [layer] }, { ...captured, imageWidth: 200, imageHeight: 200 });

    expect(projected!.points).toHaveLength(layer.points.length);
    expect(projected!.fontSize).toBe(40);
    expect(projected!.text).toBe("Hi");
    expect(projected!.points[0]).toEqual({ x: 20, y: 20 });
  });

  it("drops a text layer the capture would only half show instead of cropping its words", () => {
    const layer = createTextStroke({ id: "text-1", corner: { x: 90, y: 10 }, text: "Overflowing words", fontSize: 20, color: "#0096ff" });

    expect(projectLiveStrokes({ ...draft, strokes: [layer] }, captured)).toEqual([]);
  });
});
