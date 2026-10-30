import { connectFrame, type FrameConnection } from "./frameConnection.ts";
import { getRegisteredFrames } from "./projection.ts";
import type { DebugViewState } from "./debugView.ts";
import type { RendererCursor } from "../ui/customCursors.ts";

/**
 * Everything a renderer needs in order to show the inspector's current state. Sent whenever it changes and whenever a
 * frame finishes loading, so a renderer can never keep a stale piece of it.
 */
export interface RendererDesiredState {
  readonly open: boolean;
  readonly interactionsEnabled: boolean;
  readonly cursor: RendererCursor;
  /** CSS cursor for the Comment tool; the controller renders it. */
  readonly commentCursor: string | null;
  readonly spaceHeld: boolean;
  readonly boardGestures: boolean;
  /** Ordinary wheel gestures pan the board instead of scrolling the app. */
  readonly panScroll: boolean;
  /** Space turns a drag into a board pan even while the app takes native wheel input. */
  readonly spacePan: boolean;
  /** Hovering a link offers opening it in a new canvas frame. */
  readonly linkPreviews: boolean;
  readonly debugView: DebugViewState;
}

export interface RendererDesiredStateInput {
  readonly open: boolean;
  readonly interactionsEnabled: boolean;
  readonly cursor: RendererCursor;
  readonly commentCursor: string | null;
  readonly spaceHeld: boolean;
  readonly boardGestures: boolean;
  readonly appInteractive: boolean;
  readonly linkPreviews: boolean;
  readonly debugView: DebugViewState;
}

export function rendererDesiredState(input: RendererDesiredStateInput): RendererDesiredState {
  return {
    open: input.open,
    interactionsEnabled: input.interactionsEnabled,
    cursor: input.cursor,
    commentCursor: input.commentCursor,
    spaceHeld: input.spaceHeld,
    boardGestures: input.boardGestures,
    panScroll: input.boardGestures && !input.appInteractive,
    spacePan: input.boardGestures,
    linkPreviews: input.linkPreviews,
    debugView: input.debugView,
  };
}

/**
 * Sends the whole state, so a renderer that just loaded does not depend on which pieces changed since. Renderers
 * treat an unchanged re-send as a no-op, so this is safe to call on any change.
 */
export function sendRendererState(frame: FrameConnection, state: RendererDesiredState): void {
  // Before the gesture state, which clears a held Space while the app has the pointer.
  frame.post({ type: "pan-modifier", spaceHeld: state.spaceHeld });
  frame.post({
    type: "inspector-interaction-state",
    open: state.open,
    interactionsEnabled: state.interactionsEnabled,
    cursor: state.cursor,
    ...(state.cursor === "comment" && state.commentCursor ? { commentCursor: state.commentCursor } : {}),
  });
  frame.post({ type: "board-gesture-state", enabled: state.boardGestures, panScroll: state.panScroll, spacePan: state.spacePan });
  frame.post({ type: "link-preview-state", enabled: state.linkPreviews });
  frame.post({ type: "debug-view-state", state: state.debugView });
}

export function sendRendererStateToAll(state: RendererDesiredState): void {
  for (const [cardId, iframe] of getRegisteredFrames()) sendRendererState(connectFrame(cardId, iframe), state);
}

/** Plays every animation on every card's page again from its start. */
export function sendAnimationReplayToAll(): void {
  for (const [cardId, iframe] of getRegisteredFrames()) connectFrame(cardId, iframe).post({ type: "animation-replay" });
}
