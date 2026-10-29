import { useState, type ReactElement } from "react";
import "@inspector/canvas/CanvasToolbar.css";
import "@inspector/canvas/sketch/SketchToolBar.css";
import { CanvasToolbar, type CanvasInteractionTool } from "@inspector/canvas/CanvasToolbar.tsx";
import { SketchToolBar } from "@inspector/canvas/sketch/SketchToolBar.tsx";
import type { SketchDrawingTool } from "@inspector/sketch/drawingTools.ts";
import { SKETCH_PEN_COLORS, type SketchPenColor } from "@inspector/sketch/model.ts";
import { ToastRegion } from "@inspector/ui/Toast.tsx";
import { TooltipGroup } from "@inspector/ui/Tooltip.tsx";

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
  readonly hasMarks: boolean;
  readonly capturing?: boolean;
  readonly paletteOpen?: boolean;
}

/** One sketch bar for each state it can be in. Every bar is live: change its tool or colour. */
const BAR_STATES: readonly BarState[] = [
  { id: "pen", title: "Pen", description: "The default tool, with the active tool lifted into its well.", tool: "pen", hasMarks: true },
  { id: "eraser", title: "Eraser", description: "Choosing a colour hands the eraser back to the pen.", tool: "eraser", hasMarks: true },
  { id: "rectangle", title: "Rectangle", description: "Takes the pen colour.", tool: "rectangle", colorId: "orange", hasMarks: true },
  { id: "ellipse", title: "Circle", description: "Picked from the shape menu; the button keeps it.", tool: "ellipse", colorId: "orange", hasMarks: true },
  { id: "arrow", title: "Arrow", description: "Picked from the shape menu; the button keeps it.", tool: "arrow", colorId: "orange", hasMarks: true },
  { id: "text", title: "Text", description: "Click the sketch to type.", tool: "text", hasMarks: true },
  { id: "color", title: "Another colour", description: "The pen, the shapes and the text follow the chosen colour.", tool: "pen", colorId: "red", hasMarks: true },
  { id: "palette", title: "Colour palette open", description: "The swatches fan out above the bar.", tool: "pen", hasMarks: true, paletteOpen: true },
  { id: "empty", title: "Nothing drawn yet", description: "A screenshot still works; there is nothing to clear.", tool: "pen", hasMarks: false },
  { id: "capturing", title: "Taking a screenshot", description: "The screenshot button is busy and disabled.", tool: "pen", hasMarks: true, capturing: true },
];

function CanvasToolbarFixture({ tool: initialTool, title }: {
  readonly tool: CanvasInteractionTool;
  readonly title: string;
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
        />
        <SketchToolBar
          open={tool === "sketch"}
          still
          tool={sketchTool}
          color={color}
          capturing={false}
          hasMarks
          onToolChange={setSketchTool}
          onColorChange={setColor}
          onScreenshot={noop}
          onClear={noop}
        />
      </div>
      <figcaption>{title}</figcaption>
    </figure>
  );
}

function SketchBarFixture({ state }: { readonly state: BarState }): ReactElement {
  const [tool, setTool] = useState(state.tool);
  const [color, setColor] = useState<SketchPenColor>(SKETCH_PEN_COLORS.find((candidate) => candidate.id === state.colorId) ?? DEFAULT_COLOR);
  return (
    <figure className="toolbar-fixture" data-test={`sketch-bar-${state.id}`}>
      <div className="toolbar-stage" data-size={state.paletteOpen ? "palette" : "sketch"}>
        <CanvasToolbar
          tool="sketch"
          sketchEnabled
          onToolChange={noop}
        />
        <SketchToolBar
          open
          still
          paletteOpen={state.paletteOpen}
          tool={tool}
          color={color}
          capturing={state.capturing ?? false}
          hasMarks={state.hasMarks}
          onToolChange={(next) => setTool(next)}
          onColorChange={(next) => {
            setColor(next);
            if (tool === "eraser") setTool("pen");
          }}
          onScreenshot={noop}
          onClear={noop}
        />
      </div>
      <figcaption><strong>{state.title}</strong> {state.description}</figcaption>
    </figure>
  );
}

/** The real canvas toolbar and sketch bar, driven by local state instead of the canvas, with every sketch state on one page. */
export function ToolbarGallery(): ReactElement {
  return (
    <TooltipGroup>
      <div className="toolbar-gallery" data-test="toolbar-gallery">
        <section aria-labelledby="canvas-toolbar-heading">
          <h3 id="canvas-toolbar-heading">Each tool active</h3>
          <div className="toolbar-grid">
            {CANVAS_TOOLS.map((item) => <CanvasToolbarFixture key={item.tool} tool={item.tool} title={item.title}/>)}
          </div>
        </section>
        <section aria-labelledby="sketch-bar-heading">
          <h3 id="sketch-bar-heading">Sketch bar states</h3>
          <div className="toolbar-grid">
            {BAR_STATES.map((state) => <SketchBarFixture key={state.id} state={state}/>)}
          </div>
        </section>
      </div>
      <ToastRegion />
    </TooltipGroup>
  );
}
