// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SKETCH_ANNOTATION_RADIUS, SKETCH_STROKE_COLOR } from "./model.ts";
import { copyImageAndTextToClipboard, drawSketchAnnotation, drawSketchStroke } from "./raster.ts";

class TestClipboardItem {
  readonly representations: Record<string, Blob>;

  constructor(representations: Record<string, Blob>) {
    this.representations = representations;
  }
}

describe("combined sketch clipboard", () => {
  beforeEach(() => {
    vi.stubGlobal("ClipboardItem", TestClipboardItem);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
  });

  it("writes the image and prompt as representations of one clipboard item", async () => {
    const write = vi.fn(async (_items: readonly unknown[]) => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write },
    });
    const image = new Blob(["png"], { type: "image/png" });

    await copyImageAndTextToClipboard(image, "Tell the agent to adjust this card.");

    expect(write).toHaveBeenCalledTimes(1);
    const [items] = write.mock.calls[0] ?? [];
    const [item] = (items as readonly unknown[] | undefined) ?? [];
    expect(item).toBeInstanceOf(TestClipboardItem);
    const clipboardItem = item as TestClipboardItem;
    expect(clipboardItem.representations["image/png"]).toBe(image);
    const textBlob = clipboardItem.representations["text/plain"];
    if (!textBlob) throw new Error("The combined clipboard item did not include text.");
    const prompt = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(textBlob);
    });
    expect(prompt).toBe("Tell the agent to adjust this card.");
  });

  it("reports when combined clipboard access is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });

    await expect(copyImageAndTextToClipboard(new Blob(["png"], { type: "image/png" }), "Prompt"))
      .rejects.toThrow("Combined image and text clipboard access is unavailable");
  });
});

describe("sketch stroke rendering", () => {
  it("fills one blue accent freehand outline", () => {
    const context = {
      beginPath: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      fillStyle: "",
      lineCap: "",
      lineJoin: "",
      lineTo: vi.fn(),
      lineWidth: 0,
      moveTo: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    drawSketchStroke(context, { width: 6, points: [{ x: 10, y: 12 }, { x: 20, y: 22 }] });

    expect(context.fill).toHaveBeenCalledTimes(1);
    expect(context.fillStyle).toBe(SKETCH_STROKE_COLOR);
    expect(context.closePath).toHaveBeenCalledTimes(1);
  });

  it("draws numbered annotations with the blue accent", () => {
    const context = {
      arc: vi.fn(),
      beginPath: vi.fn(),
      fill: vi.fn(),
      fillStyle: "",
      fillText: vi.fn(),
      font: "",
      restore: vi.fn(),
      save: vi.fn(),
      textAlign: "",
      textBaseline: "",
    } as unknown as CanvasRenderingContext2D;

    drawSketchAnnotation(context, { number: 2, point: { x: 10, y: 12 } });

    expect(context.arc).toHaveBeenCalledWith(10, 12, SKETCH_ANNOTATION_RADIUS, 0, Math.PI * 2);
    expect(context.fill).toHaveBeenCalledTimes(1);
    expect(context.fillText).toHaveBeenCalledWith("2", 10, 12);
    expect(context.fillStyle).toBe("#ffffff");
  });
});
