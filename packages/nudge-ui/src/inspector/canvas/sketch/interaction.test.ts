// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginSketchCapture,
  cancelSketchInteraction,
  completeSketchCapture,
  isSketchInteractionActive,
} from "./interaction.ts";
import { captureViewport } from "../../sketch/capture.ts";

const captured = {
  pageImage: new Blob(["png"], { type: "image/png" }),
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
    cancelSketchInteraction();
    capture.mockClear();
    capture.mockResolvedValue(captured);
  });

  it("opens the tool without capturing, and closes it again", () => {
    beginSketchCapture();

    expect(isSketchInteractionActive()).toBe(true);
    expect(capture).not.toHaveBeenCalled();

    cancelSketchInteraction();

    expect(isSketchInteractionActive()).toBe(false);
  });

  it("hands the capture result back and keeps the tool open for the next sketch", async () => {
    const hostElement = document.createElement("div");
    beginSketchCapture();

    await expect(completeSketchCapture(hostElement, capture)).resolves.toBe(captured);
    expect(capture).toHaveBeenCalledWith(expect.not.objectContaining({ method: expect.anything() }));
    expect(isSketchInteractionActive()).toBe(true);
  });

  it("closes the tool when a capture is aborted", async () => {
    const hostElement = document.createElement("div");
    beginSketchCapture();
    capture.mockImplementationOnce(({ signal }) => new Promise((_, reject) => {
      signal?.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    const pending = completeSketchCapture(hostElement, capture);
    cancelSketchInteraction();

    await expect(pending).rejects.toThrow("aborted");
    expect(isSketchInteractionActive()).toBe(false);
  });

  it("stays open when the tool is reopened before an aborted capture settles", async () => {
    const hostElement = document.createElement("div");
    beginSketchCapture();
    let rejectCapture: (error: Error) => void = () => undefined;
    capture.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectCapture = reject;
    }));
    const pending = completeSketchCapture(hostElement, capture);
    cancelSketchInteraction();
    beginSketchCapture();
    rejectCapture(new Error("aborted"));

    await expect(pending).rejects.toThrow("aborted");
    expect(isSketchInteractionActive()).toBe(true);
  });
});
