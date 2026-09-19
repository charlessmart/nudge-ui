import { describe, expect, it } from "vitest";
import { projectLiveStrokes } from "./SketchWorkspace.tsx";
import type { SketchLiveDraft } from "./SketchOverlay.tsx";
import type { CapturedSketch } from "./capture.ts";
import type { SketchStroke } from "./model.ts";

const stroke: SketchStroke = {
  id: "stroke-1",
  kind: "freehand",
  width: 6,
  color: "#0096ff",
  outlineColor: "",
  points: [
    { x: 40, y: 40 },
    { x: 140, y: 40 },
  ],
};

const draft: SketchLiveDraft = {
  description: "",
  strokes: [stroke],
  annotations: [],
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
  originalImage: new Blob(["png"], { type: "image/png" }),
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
});
