import type { CanvasInteractionTool } from "./keyboardShortcuts.ts";
import { DEBUG_VIEW_OFF, type DebugViewState } from "./debugView.ts";
import type { CanvasPresentation } from "./viewStore.ts";
import type { RendererCursor } from "../ui/customCursors.ts";

/** Which board pointer gesture is in progress, from the workspace's pan bookkeeping. */
export type BoardPointerState = "idle" | "grabbable" | "grabbing";

/** What the board's own cursor should show. `null` leaves the browser's default. */
export type BoardCursorKind = "grabbing" | "pan" | "comment" | "design" | null;

export interface CanvasToolInput {
  /** The tool the user selected. Holding the app-interaction key does not change it. */
  readonly tool: CanvasInteractionTool;
  /** The Inspection tool's views, applied only while that tool is active. */
  readonly outlines: boolean;
  readonly explode: boolean;
  readonly spacing: boolean;
  /** The Inspection tool's animation speed, applied to the page only while that tool is active. */
  readonly animationSpeed: number;
  readonly presentation: CanvasPresentation;
  readonly layoutTransitioning: boolean;
  readonly sketchActive: boolean;
  /** True while the app-interaction key is held, which acts as the `select` tool. */
  readonly temporaryAppInteraction: boolean;
  readonly pointer: BoardPointerState;
}

/**
 * Everything the canvas derives from the active tool: whether the app takes the pointer, which view the renderer
 * applies, which cursor each surface shows, and which tools are switched on as a consequence.
 */
export interface CanvasToolEffects {
  /** The effective tool, with a held app-interaction key standing in for `select`. */
  readonly tool: CanvasInteractionTool;
  readonly appInteractive: boolean;
  /** The inspection bar is up. */
  readonly inspectionBarActive: boolean;
  readonly debugView: DebugViewState;
  readonly rendererInteractionsEnabled: boolean;
  readonly rendererCursor: RendererCursor;
  readonly boardCursor: BoardCursorKind;
  readonly linksOpenInCards: boolean;
  readonly commentToolActive: boolean;
}

/** The Inspection tool slows the page and applies whichever views are on, together. */
function debugViewState(input: CanvasToolInput): DebugViewState {
  if (input.tool !== "debug") return DEBUG_VIEW_OFF;
  return { outlines: input.outlines, xray: input.explode, spacing: input.spacing, animationSpeed: input.animationSpeed };
}

function boardCursor(tool: CanvasInteractionTool, pointer: BoardPointerState): BoardCursorKind {
  if (pointer === "grabbing") return "grabbing";
  if (pointer === "grabbable") return "pan";
  if (tool === "comment") return "comment";
  if (tool === "design") return "design";
  return null;
}

export function canvasToolEffects(input: CanvasToolInput): CanvasToolEffects {
  const tool = input.temporaryAppInteraction ? "select" : input.tool;
  // The Inspection tool inspects the running app, so it stays interactive like the play tool: the slowed animations
  // are the ones the user triggers by hovering and clicking. With a view switched on, clicks select elements as the
  // design tool's do; Explode on click adds to that, pulling the clicked subtree's layers apart.
  const inspectionSelects = tool === "debug" && (input.outlines || input.spacing || input.explode);
  const appInteractive = tool === "select" || (tool === "debug" && !inspectionSelects);
  return {
    tool,
    appInteractive,
    // Follows the selected tool, so the bar stays up while the app-interaction key is held.
    inspectionBarActive: input.tool === "debug",
    debugView: debugViewState(input),
    rendererInteractionsEnabled: !appInteractive && !input.layoutTransitioning && !input.sketchActive,
    rendererCursor: tool === "comment" ? "comment" : "design",
    boardCursor: boardCursor(tool, input.pointer),
    linksOpenInCards: appInteractive && input.presentation === "canvas",
    commentToolActive: tool === "comment",
  };
}
