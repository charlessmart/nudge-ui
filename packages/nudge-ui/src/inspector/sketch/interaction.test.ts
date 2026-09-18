// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginSketchCapture,
  closeSketchEditor,
  completeSketchCapture,
  getSketchInteractionSnapshot,
  resetSketchInteraction,
} from "./interaction.ts";
import { captureViewport } from "./capture.ts";

vi.mock("./capture.ts", () => ({
  captureViewport: vi.fn(),
}));

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

describe("sketch interaction", () => {
  beforeEach(() => {
    resetSketchInteraction();
    vi.mocked(captureViewport).mockResolvedValue(captured);
  });

  it("waits for Done before capturing a newly started sketch", async () => {
    const hostElement = document.createElement("div");
    beginSketchCapture();

    expect(getSketchInteractionSnapshot().captureState).toBe("sketching");
    expect(captureViewport).not.toHaveBeenCalled();

    await completeSketchCapture(hostElement);
    await vi.waitFor(() => expect(getSketchInteractionSnapshot().captureState).toBe("ready"));

    expect(captureViewport).toHaveBeenCalledWith(expect.objectContaining({ method: "dom" }));

    closeSketchEditor();

    expect(getSketchInteractionSnapshot()).toEqual({
      captureState: "idle",
      captured: null,
      editingId: null,
      error: null,
      initialTool: "pen",
    });
  });
});
