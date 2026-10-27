// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { cancelSketchInteraction, isSketchInteractionActive, openSketchInteraction, sketchOpenedByKeyboard } from "./interaction.ts";
import {
  clearAllSketchMarks,
  getSketchMarks,
  hasSketchMarks,
  resetSketchMarks,
  setSketchEditingKey,
  setSketchMarksCapturing,
  showsPassiveMarks,
  sketchMarksKey,
  useSketchMarks,
  type SketchMarksControls,
} from "./marksStore.ts";
import type { SketchStroke } from "../../sketch/model.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function stroke(id: string): SketchStroke {
  return { id, kind: "freehand", width: 6, color: "#0096ff", points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] };
}

const roots: Root[] = [];

/** Renders the hook for one key and hands back its latest controls. */
function renderMarks(key: string): () => SketchMarksControls {
  let latest: SketchMarksControls | null = null;
  function Probe(): null {
    latest = useSketchMarks(key);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Probe)));
  roots.push(root);
  return () => latest!;
}

const home = sketchMarksKey("card-1", "http://localhost/");
const pricing = sketchMarksKey("card-1", "http://localhost/pricing");
const other = sketchMarksKey("card-2", "http://localhost/");

describe("sketch interaction", () => {
  beforeEach(() => {
    cancelSketchInteraction();
    resetSketchMarks();
  });

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
  });

  it("opens and closes the tool, remembering only how it was first opened", () => {
    openSketchInteraction({ viaKeyboard: true });
    openSketchInteraction();

    expect(isSketchInteractionActive()).toBe(true);
    expect(sketchOpenedByKeyboard()).toBe(true);

    cancelSketchInteraction();

    expect(isSketchInteractionActive()).toBe(false);
  });

  it("keeps marks after the tool closes, apart for each frame and page", () => {
    openSketchInteraction();
    const homeMarks = renderMarks(home);
    const otherMarks = renderMarks(other);
    act(() => homeMarks().addStroke(stroke("a")));
    act(() => otherMarks().addStroke(stroke("b")));
    act(() => cancelSketchInteraction());

    expect(getSketchMarks(home).strokes.map(({ id }) => id)).toEqual(["a"]);
    expect(getSketchMarks(other).strokes.map(({ id }) => id)).toEqual(["b"]);
    expect(getSketchMarks(pricing).strokes).toEqual([]);
  });

  it("undoes only the frame being edited", () => {
    const homeMarks = renderMarks(home);
    const otherMarks = renderMarks(other);
    act(() => homeMarks().addStroke(stroke("a")));
    act(() => otherMarks().addStroke(stroke("b")));

    act(() => homeMarks().undo());

    expect(getSketchMarks(home).strokes).toEqual([]);
    expect(getSketchMarks(other).strokes.map(({ id }) => id)).toEqual(["b"]);
  });

  it("clears every frame at once, and each frame can undo its own clear", () => {
    const homeMarks = renderMarks(home);
    const otherMarks = renderMarks(other);
    act(() => homeMarks().addStroke(stroke("a")));
    act(() => otherMarks().addStroke(stroke("b")));

    act(() => clearAllSketchMarks());

    expect(hasSketchMarks()).toBe(false);

    act(() => otherMarks().undo());

    expect(getSketchMarks(other).strokes.map(({ id }) => id)).toEqual(["b"]);
    expect(getSketchMarks(home).strokes).toEqual([]);
  });

  it("leaves the edited frame to the sketch surface, except while a screenshot is taken", () => {
    setSketchEditingKey(home);

    expect(showsPassiveMarks(home)).toBe(false);
    expect(showsPassiveMarks(other)).toBe(true);

    setSketchMarksCapturing(true);

    expect(showsPassiveMarks(home)).toBe(true);
  });
});
