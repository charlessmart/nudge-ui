import { describe, expect, it } from "vitest";
import { canvasToolEffects, type CanvasToolInput } from "./toolEffects.ts";
import { DEBUG_VIEW_OFF } from "./debugView.ts";

function input(overrides: Partial<CanvasToolInput> = {}): CanvasToolInput {
  return {
    tool: "design",
    outlines: false,
    explode: false,
    spacing: false,
    animationSpeed: 0.3,
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

  it("applies no debug view outside the Inspection tool", () => {
    expect(canvasToolEffects(input({ outlines: true, explode: true })).debugView).toEqual(DEBUG_VIEW_OFF);
  });

  it("keeps the app interactive under the Inspection tool and slows the page with no views on", () => {
    const effects = canvasToolEffects(input({ tool: "debug", animationSpeed: 0.1 }));
    expect(effects.appInteractive).toBe(true);
    expect(effects.inspectionBarActive).toBe(true);
    expect(effects.debugView).toEqual({ outlines: false, xray: false, spacing: false, animationSpeed: 0.1 });
  });

  it("applies outlines and explode together, alongside the slowed speed", () => {
    const effects = canvasToolEffects(input({ tool: "debug", outlines: true, explode: true, spacing: true, animationSpeed: 0.5 }));
    expect(effects.debugView).toEqual({ outlines: true, xray: true, spacing: true, animationSpeed: 0.5 });
  });

  it("runs the page at full speed while another tool is active", () => {
    expect(canvasToolEffects(input({ tool: "select", animationSpeed: 0.1 })).debugView.animationSpeed).toBe(1);
  });

  it("lets the Inspection tool select elements while outlines, spacing or Explode on click is on", () => {
    const speedOnly = canvasToolEffects(input({ tool: "debug" }));
    expect(speedOnly.appInteractive).toBe(true);
    expect(speedOnly.rendererInteractionsEnabled).toBe(false);

    for (const views of [{ outlines: true }, { spacing: true }, { explode: true }]) {
      const effects = canvasToolEffects(input({ tool: "debug", ...views }));
      expect(effects.appInteractive).toBe(false);
      expect(effects.rendererInteractionsEnabled).toBe(true);
      expect(effects.linksOpenInCards).toBe(false);
    }
  });

  it("treats a held app-interaction key as the select tool but keeps the inspection bar and views up", () => {
    const effects = canvasToolEffects(input({ tool: "debug", explode: true, temporaryAppInteraction: true }));
    expect(effects.tool).toBe("select");
    expect(effects.appInteractive).toBe(true);
    expect(effects.debugView.xray).toBe(true);
    expect(effects.inspectionBarActive).toBe(true);
    expect(effects.commentToolActive).toBe(false);
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
