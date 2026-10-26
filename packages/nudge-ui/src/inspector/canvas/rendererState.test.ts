import { describe, expect, it } from "vitest";
import { rendererDesiredState, sendRendererState, type RendererDesiredStateInput } from "./rendererState.ts";
import type { FrameConnection } from "./frameConnection.ts";
import { DEBUG_VIEW_OFF } from "./debugView.ts";

function input(overrides: Partial<RendererDesiredStateInput> = {}): RendererDesiredStateInput {
  return {
    open: true,
    interactionsEnabled: true,
    cursor: "design",
    commentCursor: null,
    spaceHeld: false,
    boardGestures: true,
    appInteractive: false,
    linkPreviews: false,
    debugView: DEBUG_VIEW_OFF,
    ...overrides,
  };
}

function recordingFrame(): { frame: FrameConnection; messages: unknown[] } {
  const messages: unknown[] = [];
  const frame = { post: (message: unknown) => messages.push(message) } as unknown as FrameConnection;
  return { frame, messages };
}

describe("rendererDesiredState", () => {
  it("pans the board on an ordinary wheel only while the app does not own the pointer", () => {
    expect(rendererDesiredState(input({ appInteractive: false })).panScroll).toBe(true);
    expect(rendererDesiredState(input({ appInteractive: true })).panScroll).toBe(false);
  });

  it("does not pan the board while the app owns the pointer, whatever the gesture state", () => {
    expect(rendererDesiredState(input({ boardGestures: true, appInteractive: true })).panScroll).toBe(false);
    expect(rendererDesiredState(input({ boardGestures: false, appInteractive: false })).panScroll).toBe(false);
  });
});

describe("sendRendererState", () => {
  it("sends every piece of state, so a renderer that just loaded needs no separate catch-up", () => {
    const { frame, messages } = recordingFrame();
    sendRendererState(frame, rendererDesiredState(input()));
    expect(messages).toEqual([
      { type: "pan-modifier", spaceHeld: false },
      { type: "inspector-interaction-state", open: true, interactionsEnabled: true, cursor: "design" },
      { type: "board-gesture-state", enabled: true, panScroll: true, spacePan: true },
      { type: "link-preview-state", enabled: false },
      { type: "debug-view-state", state: DEBUG_VIEW_OFF },
    ]);
  });

  it("includes the comment cursor only while the comment tool is active", () => {
    const { frame, messages } = recordingFrame();
    sendRendererState(frame, rendererDesiredState(input({ cursor: "comment", commentCursor: "url(x) 1 1, crosshair" })));
    const interactionState = (sent: readonly unknown[]) => sent.find((message) =>
      (message as { type?: unknown }).type === "inspector-interaction-state");
    expect(interactionState(messages)).toMatchObject({ cursor: "comment", commentCursor: "url(x) 1 1, crosshair" });

    const { frame: other, messages: without } = recordingFrame();
    sendRendererState(other, rendererDesiredState(input({ commentCursor: "url(x) 1 1, crosshair" })));
    expect(interactionState(without)).not.toHaveProperty("commentCursor");
  });
});
