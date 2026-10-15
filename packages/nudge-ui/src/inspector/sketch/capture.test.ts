// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureViewport, getSketchScrollPosition, type DomCaptureToBlob, type SketchCaptureResources } from "./capture.ts";
import { getPngDimensions } from "./raster.ts";

// The renderer and PNG reader need canvas APIs jsdom lacks, so every capture injects stand-ins.
const toBlob = vi.fn<DomCaptureToBlob>();
const pngDimensions = vi.fn<typeof getPngDimensions>();
const resources: SketchCaptureResources = { toBlob, pngDimensions };

const pngHeader = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10,
  0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1,
]);

describe("DOM sketch capture", () => {
  beforeEach(() => {
    toBlob.mockResolvedValue(new Blob([pngHeader], { type: "image/png" }));
    pngDimensions.mockResolvedValue({ width: 1, height: 1 });
  });

  it("falls back to document scrolling for horizontal page offsets", () => {
    const targetDocument = {
      scrollingElement: { scrollLeft: 240, scrollTop: 90 },
      documentElement: { scrollLeft: 240, scrollTop: 90 },
      body: { scrollLeft: 0, scrollTop: 0 },
    } as unknown as Document;
    const targetWindow = {
      document: targetDocument,
      scrollX: 0,
      pageXOffset: 0,
      scrollY: 0,
      pageYOffset: 0,
    } as unknown as Window;

    expect(getSketchScrollPosition(targetWindow)).toEqual({ x: 240, y: 90 });
  });

  it("renders the page root without calling screen capture APIs", async () => {
    const hostElement = document.createElement("div");
    hostElement.style.visibility = "visible";
    document.body.append(hostElement);
    document.documentElement.setAttribute("data-nudge-ui-panel", "open");

    const captured = await captureViewport({ hostElement }, resources);
    const [node, options] = toBlob.mock.calls[0] ?? [];

    expect(node).toBe(document.documentElement);
    expect(options).toMatchObject({
      type: "image/png",
      width: window.innerWidth,
      height: window.innerHeight,
      features: { restoreScrollPosition: true },
    });
    expect(options?.filter?.(hostElement)).toBe(false);
    expect(options?.onCloneEachNode).toBeTypeOf("function");
    expect(captured.imageWidth).toBe(1);
    expect(captured.imageHeight).toBe(1);
    expect(hostElement.style.visibility).toBe("visible");
    expect(document.documentElement.getAttribute("data-nudge-ui-panel")).toBe("open");
  });

  it("uses the inspector edge as the DOM capture width", async () => {
    const hostElement = document.createElement("div");
    const shadowRoot = hostElement.attachShadow({ mode: "open" });
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.dataset.open = "true";
    Object.defineProperty(panel, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 640, width: 320 }),
    });
    shadowRoot.append(panel);
    document.body.append(hostElement);

    await captureViewport({ hostElement }, resources);

    expect(toBlob.mock.calls.at(-1)?.[1]?.width).toBe(640);
  });

  it("keeps stalled media from consuming the full capture budget", async () => {
    const hostElement = document.createElement("div");
    document.body.append(hostElement);

    await captureViewport({ hostElement }, resources);

    expect(toBlob.mock.calls.at(-1)?.[1]?.timeout).toBe(500);
  });

  it("removes remote Google font stylesheets from the cloned document", async () => {
    const hostElement = document.createElement("div");
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Inter";
    document.head.append(link);
    document.body.append(hostElement);

    await captureViewport({ hostElement }, resources);

    const options = toBlob.mock.calls.at(-1)?.[1];
    options?.onCloneEachNode?.(link);

    expect(link.isConnected).toBe(false);
    expect(options?.font).toBe(false);
  });

  it("reports a processing timeout when rendering does not settle", async () => {
    const hostElement = document.createElement("div");
    document.body.append(hostElement);
    toBlob.mockImplementation(() => new Promise<Blob>(() => undefined));

    await expect(captureViewport({ hostElement, processingTimeoutMs: 10 }, resources)).rejects.toMatchObject({
      code: "processing-timeout",
    });
  });
});
