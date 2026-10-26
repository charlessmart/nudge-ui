import { useEffect, useState } from "react";
import {
  SKETCH_SCHEMA_VERSION,
  SKETCH_PEN_COLORS,
  type SketchDocument,
} from "@inspector/sketch/model.ts";
import { sketchInkBounds } from "@inspector/sketch/ink.ts";

const WIDTH = 600;
const HEIGHT = 900;

/** Each fixture sketch is a different page, so the saved sketches can be told apart in the stack and its preview. */
const LAYOUTS = [
  { background: "#f3f4f6", blocks: [[40, 40, 520, 90], [40, 160, 250, 300], [310, 160, 250, 300], [40, 490, 520, 360]], mark: "red" },
  { background: "#eef3ff", blocks: [[40, 40, 520, 60], [40, 130, 520, 220], [40, 380, 160, 200], [220, 380, 160, 200], [400, 380, 160, 200]], mark: "blue" },
  { background: "#f6f1e8", blocks: [[40, 40, 240, 240], [300, 40, 260, 110], [300, 170, 260, 110], [40, 310, 520, 540]], mark: "green" },
] as const;

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The fixture sketch could not be drawn."))), "image/png");
  });
}

async function createFixtureSketch(index: number): Promise<SketchDocument> {
  const layout = LAYOUTS[index % LAYOUTS.length]!;
  const color = SKETCH_PEN_COLORS.find((candidate) => candidate.id === layout.mark)!;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d")!;
  context.fillStyle = layout.background;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = "#ffffff";
  for (const [x, y, width, height] of layout.blocks) {
    context.beginPath();
    context.roundRect(x, y, width, height, 16);
    context.fill();
  }
  const points = [{ x: 90, y: 200 }, { x: 250, y: 150 }, { x: 420, y: 260 }, { x: 330, y: 420 }, { x: 140, y: 380 }, { x: 90, y: 200 }];
  context.strokeStyle = color.value;
  const lineWidth = 8;
  context.lineWidth = lineWidth;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  points.forEach((point, step) => (step === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)));
  context.stroke();
  const image = await toBlob(canvas);
  const now = Date.now() - index * 60_000;
  return {
    schemaVersion: SKETCH_SCHEMA_VERSION,
    projectId: "inspector-workbench-fixtures",
    id: `fixture-sketch-${index}`,
    createdAt: now,
    updatedAt: now,
    url: "http://localhost:5186/",
    imageWidth: WIDTH,
    imageHeight: HEIGHT,
    image,
    ink: sketchInkBounds([{ points, width: lineWidth }], WIDTH, HEIGHT) ?? undefined,
  };
}

/** Saved sketches for the fixtures, newest first, drawn once in the browser. Empty until they are ready. */
export function useFixtureSketches(count: number): readonly SketchDocument[] {
  const [sketches, setSketches] = useState<readonly SketchDocument[]>([]);
  useEffect(() => {
    let current = true;
    void Promise.all(Array.from({ length: count }, (_, index) => createFixtureSketch(index))).then((items) => {
      if (current) setSketches(items);
    });
    return () => {
      current = false;
    };
  }, [count]);
  return sketches;
}
