import { describe, expect, it } from "vitest";
import { canvasToolEffects, type CanvasToolInput } from "./toolEffects.ts";
import { DEBUG_VIEW_OFF } from "./debugView.ts";

function input(overrides: Partial<CanvasToolInput> = {}): CanvasToolInput {
  return {
    tool: "design",
    debugView: "animation",
    animationBusy: false,
    presentation: "canvas",
    layoutTransitioning: false,
    sketchActive: false,
    temporaryAppInteraction: false,
    pointer: "idle",
    ...overrides,
  };
}

describe("canvasToolEffects", () => {
  it("keeps the app out of the pointer for the design tool and shows the design cursor", () => {
    const effects = canvasToolEffects(input());
    expect(effects.appInteractive).toBe(false);
    expect(effects.rendererInteractionsEnabled).toBe(true);
    expect(effects.rendererCursor).toBe("design");
    expect(effects.boardCursor).toBe("design");
    expect(effects.commentToolActive).toBe(false);
    expect(effects.linksOpenInCards).toBe(false);
  });

  it("hands the pointer to the app for the select tool and opens links in cards on the board", () => {
    const effects = canvasToolEffects(input({ tool: "select" }));
    expect(effects.appInteractive).toBe(true);
    expect(effects.rendererInteractionsEnabled).toBe(false);
    expect(effects.linksOpenInCards).toBe(true);
    expect(effects.boardCursor).toBeNull();
  });

  it("does not open links in cards in focus mode", () => {
    expect(canvasToolEffects(input({ tool: "select", presentation: "focus" })).linksOpenInCards).toBe(false);
  });

  it("turns the comment tool on and shows the comment cursor", () => {
    const effects = canvasToolEffects(input({ tool: "comment" }));
    expect(effects.commentToolActive).toBe(true);
    expect(effects.rendererCursor).toBe("comment");
    expect(effects.boardCursor).toBe("comment");
  });

  it("applies no debug view outside the view tool", () => {
    expect(canvasToolEffects(input({ debugView: "explode" })).debugView).toEqual(DEBUG_VIEW_OFF);
  });

  it("keeps the app interactive for outline view and applies only outlines", () => {
    const effects = canvasToolEffects(input({ tool: "debug", debugView: "outlines" }));
    expect(effects.appInteractive).toBe(true);
    expect(effects.debugView).toEqual({ outlines: true, xray: false, animations: false });
  });

  it("keeps the app interactive for explode view and applies only the exploded flag", () => {
    const effects = canvasToolEffects(input({ tool: "debug", debugView: "explode" }));
    expect(effects.appInteractive).toBe(true);
    expect(effects.debugView).toEqual({ outlines: false, xray: true, animations: false });
  });

  it("selects elements in animation view and shows markers unless an animation is busy", () => {
    const idle = canvasToolEffects(input({ tool: "debug", debugView: "animation" }));
    expect(idle.appInteractive).toBe(false);
    expect(idle.animationViewActive).toBe(true);
    expect(idle.debugView.animations).toBe(true);

    const busy = canvasToolEffects(input({ tool: "debug", debugView: "animation", animationBusy: true }));
    expect(busy.debugView.animations).toBe(false);
  });

  it("treats a held app-interaction key as the select tool without changing which view is armed", () => {
    const effects = canvasToolEffects(input({ tool: "debug", debugView: "explode", temporaryAppInteraction: true }));
    expect(effects.tool).toBe("select");
    expect(effects.appInteractive).toBe(true);
    expect(effects.debugView.xray).toBe(true);
    expect(effects.animationViewActive).toBe(false);
    expect(effects.commentToolActive).toBe(false);
  });

  it("keeps the animation bar up while the app-interaction key is held in animation view", () => {
    expect(canvasToolEffects(input({ tool: "debug", debugView: "animation", temporaryAppInteraction: true })).animationViewActive)
      .toBe(true);
  });

  it("stops the renderer taking pointer interactions while sketching or transitioning layout", () => {
    expect(canvasToolEffects(input({ sketchActive: true })).rendererInteractionsEnabled).toBe(false);
    expect(canvasToolEffects(input({ layoutTransitioning: true })).rendererInteractionsEnabled).toBe(false);
  });

  it("lets the board pointer gesture outrank the tool's own cursor", () => {
    expect(canvasToolEffects(input({ tool: "comment", pointer: "grabbable" })).boardCursor).toBe("pan");
    expect(canvasToolEffects(input({ tool: "comment", pointer: "grabbing" })).boardCursor).toBe("grabbing");
  });
});
