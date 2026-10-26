import type { CanvasInteractionTool } from "./keyboardShortcuts.ts";
import { DEBUG_VIEW_OFF, type DebugViewState } from "./debugView.ts";
import type { DebugViewMode } from "./debugViewStore.ts";
import type { CanvasPresentation } from "./viewStore.ts";
import type { RendererCursor } from "../ui/customCursors.ts";

/** Which board pointer gesture is in progress, from the workspace's pan bookkeeping. */
export type BoardPointerState = "idle" | "grabbable" | "grabbing";

/** What the board's own cursor should show. `null` leaves the browser's default. */
export type BoardCursorKind = "grabbing" | "pan" | "comment" | "design" | null;

export interface CanvasToolInput {
  /** The tool the user selected. Holding the app-interaction key does not change it. */
  readonly tool: CanvasInteractionTool;
  readonly debugView: DebugViewMode;
  readonly animationBusy: boolean;
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
  /** The animation bar is up and the renderer's markers step aside while it plays. */
  readonly animationViewActive: boolean;
  readonly debugView: DebugViewState;
  readonly rendererInteractionsEnabled: boolean;
  readonly rendererCursor: RendererCursor;
  readonly boardCursor: BoardCursorKind;
  readonly linksOpenInCards: boolean;
  readonly commentToolActive: boolean;
}

/** The animation bar stays up while the app-interaction key is held, so it follows the selected tool. */
function animationViewActive(tool: CanvasInteractionTool, debugView: DebugViewMode): boolean {
  return tool === "debug" && debugView === "animation";
}

function debugViewState(tool: CanvasInteractionTool, debugView: DebugViewMode, animationBusy: boolean): DebugViewState {
  if (tool !== "debug") return DEBUG_VIEW_OFF;
  // Markers step aside while the animation moves.
  if (debugView === "animation") return { ...DEBUG_VIEW_OFF, animations: !animationBusy };
  return { outlines: debugView === "outlines", xray: debugView === "explode", animations: false };
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
  // Outline view and Explode view inspect the running app, so it stays interactive like the play tool;
  // Animation view selects elements instead.
  const appInteractive = tool === "select" || (tool === "debug" && input.debugView !== "animation");
  return {
    tool,
    appInteractive,
    animationViewActive: animationViewActive(input.tool, input.debugView),
    debugView: debugViewState(input.tool, input.debugView, input.animationBusy),
    rendererInteractionsEnabled: !appInteractive && !input.layoutTransitioning && !input.sketchActive,
    rendererCursor: tool === "comment" ? "comment" : "design",
    boardCursor: boardCursor(tool, input.pointer),
    linksOpenInCards: appInteractive && input.presentation === "canvas",
    commentToolActive: tool === "comment",
  };
}
