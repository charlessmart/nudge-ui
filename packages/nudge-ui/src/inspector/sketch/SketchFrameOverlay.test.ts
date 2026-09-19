import { describe, expect, it } from "vitest";
import { projectSketchPoint, sketchRouteKey } from "./SketchFrameOverlay.tsx";
import type { SketchDocument } from "./model.ts";

function frameWindow({
  width,
  height,
  scrollX = 0,
  scrollY = 0,
}: {
  readonly width: number;
  readonly height: number;
  readonly scrollX?: number;
  readonly scrollY?: number;
}): Window {
  return {
    innerWidth: width,
    innerHeight: height,
    scrollX,
    pageXOffset: scrollX,
    scrollY,
    pageYOffset: scrollY,
    document: {
      scrollingElement: { scrollLeft: scrollX, scrollTop: scrollY },
      documentElement: { scrollLeft: scrollX, scrollTop: scrollY },
      body: { scrollLeft: 0, scrollTop: 0 },
    },
  } as unknown as Window;
}

function sketchDocument(): SketchDocument {
  return {
    capture: {
      url: "http://localhost:5173/",
      title: "Fixture",
      timestamp: 1,
      viewportWidth: 1200,
      viewportHeight: 800,
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
      host: "vite-react",
      framework: "React",
      imageWidth: 1200,
      imageHeight: 800,
    },
    imageWidth: 1200,
    imageHeight: 800,
  } as SketchDocument;
}

describe("SketchFrameOverlay projection", () => {
  it("keeps the same sketch identity across anchor navigation", () => {
    expect(sketchRouteKey("http://localhost:5173/docs?view=wide#overview")).toBe(
      sketchRouteKey("http://localhost:5173/docs?view=wide#details"),
    );
  });

  it("keeps a sketch in the responsive viewport when the iframe gets narrower", () => {
    const point = projectSketchPoint(
      { x: 900, y: 200 },
      sketchDocument(),
      frameWindow({ width: 800, height: 600 }),
      800,
      600,
    );

    expect(point).toEqual({ x: 600, y: 200 });
  });

  it("applies horizontal scroll after responsive projection", () => {
    const point = projectSketchPoint(
      { x: 900, y: 200 },
      sketchDocument(),
      frameWindow({ width: 800, height: 600, scrollX: 100 }),
      800,
      600,
    );

    expect(point).toEqual({ x: 500, y: 200 });
  });
});
