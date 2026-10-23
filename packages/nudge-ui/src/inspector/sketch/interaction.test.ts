// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginSketchCapture,
  cancelSketchInteraction,
  completeSketchCapture,
  getSketchInteractionSnapshot,
  resetSketchInteraction,
} from "./interaction.ts";
import { captureViewport } from "./capture.ts";

const captured = {
  originalImage: new Blob(["png"], { type: "image/png" }),
  imageWidth: 1,
  imageHeight: 1,
  capture: {
    url: "http://localhost:5173/",
    title: "Fixture",
    timestamp: 1,
    viewportWidth: 800,
    viewportHeight: 600,
    scrollX: 0,
    scrollY: 0,
    devicePixelRatio: 1,
    host: "vite-react",
    framework: "React",
    imageWidth: 1,
    imageHeight: 1,
  },
};

const capture = vi.fn<typeof captureViewport>();

describe("sketch interaction", () => {
  beforeEach(() => {
    resetSketchInteraction();
    capture.mockClear();
    capture.mockResolvedValue(captured);
  });

  it("waits for the copy before capturing a newly started sketch", async () => {
    const hostElement = document.createElement("div");
    beginSketchCapture();

    expect(getSketchInteractionSnapshot().captureState).toBe("sketching");
    expect(capture).not.toHaveBeenCalled();

    await completeSketchCapture(hostElement, capture);
    await vi.waitFor(() => expect(getSketchInteractionSnapshot().captureState).toBe("ready"));

    expect(capture).toHaveBeenCalledWith(expect.not.objectContaining({ method: expect.anything() }));

    // Copying hands the tool back to a fresh canvas without keeping the capture in memory.
    beginSketchCapture();

    expect(getSketchInteractionSnapshot()).toEqual({ captureState: "sketching", captured: null, error: null });

    cancelSketchInteraction();

    expect(getSketchInteractionSnapshot()).toEqual({ captureState: "idle", captured: null, error: null });
  });
});
