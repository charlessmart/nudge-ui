// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { resolveActiveCanvasFrame } from "./activeCanvasDocument.ts";

describe("active Canvas frame resolution", () => {
  it("does not fall through to another card while the selected frame is unavailable", () => {
    const otherFrame = document.createElement("iframe");
    const frames = new Map([["other-card", otherFrame]]);

    expect(resolveActiveCanvasFrame(frames, "selected-card", "other-card")).toBeNull();
  });

  it("uses the focused frame when there is no selected card", () => {
    const focusedFrame = document.createElement("iframe");
    const frames = new Map([["focused-card", focusedFrame]]);

    expect(resolveActiveCanvasFrame(frames, null, "focused-card")).toBe(focusedFrame);
  });
});
