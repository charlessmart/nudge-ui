import { useState, type ReactElement } from "react";
import "@inspector/canvas/CanvasToolbar.css";
import "@inspector/canvas/SketchToolOptions.css";
import { CanvasToolbar, type CanvasInteractionTool } from "@inspector/canvas/CanvasToolbar.tsx";
import { SketchToolBar } from "@inspector/canvas/SketchToolOptions.tsx";
import type { SketchDrawingTool } from "@inspector/sketch/drawingTools.ts";
import { SKETCH_PEN_COLORS, type SketchPenColor, type SketchQueueItem } from "@inspector/sketch/model.ts";
import { ToastRegion } from "@inspector/ui/Toast.tsx";
import { TooltipGroup } from "@inspector/ui/Tooltip.tsx";
import { useFixtureSketches } from "./fixtureSketches.ts";

const DEFAULT_COLOR = SKETCH_PEN_COLORS.find((color) => color.id === "blue")!;

function noop(): void {}

/** The canvas toolbar with each interaction tool active. The sketch bar belongs to the Pencil, so it opens with it. */
const CANVAS_TOOLS: readonly { readonly tool: CanvasInteractionTool; readonly title: string }[] = [
  { tool: "design", title: "Select" },
  { tool: "comment", title: "Comment" },
  { tool: "sketch", title: "Pencil" },
  { tool: "select", title: "Use app normally" },
];

interface BarState {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly tool: SketchDrawingTool;
  readonly colorId?: SketchPenColor["id"];
  /** Whether there is anything drawn to save. */
  readonly hasContent: boolean;
  readonly saving?: boolean;
  /** How many saved sketches sit beside the save button. */
  readonly saved: number;
  readonly paletteOpen?: boolean;
}

/** One sketch bar for each state it can be in. Every bar is live: change its tool or colour, or hover a saved sketch. */
const BAR_STATES: readonly BarState[] = [
  { id: "pen", title: "Pen", description: "The default tool, with the active tool lifted into its well.", tool: "pen", hasContent: true, saved: 0 },
  { id: "eraser", title: "Eraser", description: "Choosing a colour hands the eraser back to the pen.", tool: "eraser", hasContent: true, saved: 0 },
  { id: "rectangle", title: "Rectangle", description: "Takes the pen colour.", tool: "rectangle", colorId: "orange", hasContent: true, saved: 0 },
  { id: "text", title: "Text", description: "Click the sketch to type.", tool: "text", hasContent: true, saved: 0 },
  { id: "color", title: "Another colour", description: "The pen and the rectangle follow the chosen colour.", tool: "pen", colorId: "red", hasContent: true, saved: 0 },
  { id: "palette", title: "Colour palette open", description: "The swatches fan out above the saved sketches.", tool: "pen", hasContent: true, saved: 1, paletteOpen: true },
  { id: "empty", title: "Nothing drawn yet", description: "Save still works: it says what to do instead.", tool: "pen", hasContent: false, saved: 0 },
  { id: "saving", title: "Saving", description: "The save button is busy and disabled.", tool: "pen", hasContent: true, saving: true, saved: 0 },
  { id: "one-saved", title: "One saved sketch", description: "Hover it for a larger preview; click to copy it again.", tool: "pen", hasContent: false, saved: 1 },
  { id: "three-saved", title: "Three saved sketches", description: "The newest sits in front, next to the save button.", tool: "pen", hasContent: false, saved: 3 },
];

function CanvasToolbarFixture({ tool: initialTool, title, sketches }: {
  readonly tool: CanvasInteractionTool;
  readonly title: string;
  readonly sketches: readonly SketchQueueItem[];
}): ReactElement {
  const [tool, setTool] = useState(initialTool);
  const [sketchTool, setSketchTool] = useState<SketchDrawingTool>("pen");
  const [color, setColor] = useState<SketchPenColor>(DEFAULT_COLOR);
  return (
    <figure className="toolbar-fixture" data-test={`canvas-toolbar-${initialTool}`}>
      <div className="toolbar-stage" data-size={tool === "sketch" ? "sketch" : "toolbar"}>
        <CanvasToolbar
          tool={tool}
          sketchEnabled
          onToolChange={setTool}
          sketchOptions={
            <SketchToolBar
              open={tool === "sketch"}
              still
              tool={sketchTool}
              color={color}
              recents={sketches.slice(0, 1)}
              saving={false}
              hasContent
              onToolChange={setSketchTool}
              onColorChange={setColor}
              onSave={noop}
            />
          }
        />
      </div>
      <figcaption>{title}</figcaption>
    </figure>
  );
}

function SketchBarFixture({ state, sketches }: { readonly state: BarState; readonly sketches: readonly SketchQueueItem[] }): ReactElement {
  const [tool, setTool] = useState(state.tool);
  const [color, setColor] = useState<SketchPenColor>(SKETCH_PEN_COLORS.find((candidate) => candidate.id === state.colorId) ?? DEFAULT_COLOR);
  return (
    <figure className="toolbar-fixture" data-test={`sketch-bar-${state.id}`}>
      <div className="toolbar-stage" data-size={state.paletteOpen ? "palette" : "sketch"}>
        <CanvasToolbar
          tool="sketch"
          sketchEnabled
          onToolChange={noop}
          sketchOptions={
            <SketchToolBar
              open
              still
              paletteOpen={state.paletteOpen}
              tool={tool}
              color={color}
              recents={sketches.slice(0, state.saved)}
              saving={state.saving ?? false}
              hasContent={state.hasContent}
              onToolChange={(next) => setTool(next)}
              onColorChange={(next) => {
                setColor(next);
                if (tool === "eraser") setTool("pen");
              }}
              onSave={noop}
            />
          }
        />
      </div>
      <figcaption><strong>{state.title}</strong> {state.description}</figcaption>
    </figure>
  );
}

/** The real canvas toolbar and sketch bar, driven by local state instead of the canvas, with every sketch state on one page. */
export function ToolbarGallery(): ReactElement {
  const sketches = useFixtureSketches(3);
  return (
    <TooltipGroup>
      <div className="toolbar-gallery" data-test="toolbar-gallery">
        <section aria-labelledby="canvas-toolbar-heading">
          <h3 id="canvas-toolbar-heading">Each tool active</h3>
          <div className="toolbar-grid">
            {CANVAS_TOOLS.map((item) => <CanvasToolbarFixture key={item.tool} tool={item.tool} title={item.title} sketches={sketches} />)}
          </div>
        </section>
        <section aria-labelledby="sketch-bar-heading">
          <h3 id="sketch-bar-heading">Sketch bar states</h3>
          <div className="toolbar-grid">
            {BAR_STATES.map((state) => <SketchBarFixture key={state.id} state={state} sketches={sketches} />)}
          </div>
        </section>
      </div>
      <ToastRegion />
    </TooltipGroup>
  );
}
