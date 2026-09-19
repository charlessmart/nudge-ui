// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { domToBlob } from "modern-screenshot";
import { captureViewport, getSketchScrollPosition } from "./capture.ts";
import { getPngDimensions } from "./raster.ts";

vi.mock("modern-screenshot", () => ({
  domToBlob: vi.fn(),
}));

vi.mock("./raster.ts", () => ({
  getPngDimensions: vi.fn(),
}));

const pngHeader = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10,
  0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1,
]);

describe("DOM sketch capture", () => {
  beforeEach(() => {
    vi.mocked(domToBlob).mockResolvedValue(new Blob([pngHeader], { type: "image/png" }));
    vi.mocked(getPngDimensions).mockResolvedValue({ width: 1, height: 1 });
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

    const captured = await captureViewport({ hostElement, method: "dom" });
    type DomCaptureOptions = {
      readonly type?: string;
      readonly width?: number;
      readonly height?: number;
      readonly features?: { readonly restoreScrollPosition?: boolean };
      readonly filter?: (node: Node) => boolean;
      readonly onCloneEachNode?: (node: Node) => void;
    };
    const calls = vi.mocked(domToBlob).mock.calls as unknown as Array<[Node, DomCaptureOptions]>;
    const [node, options] = calls[0] ?? [];

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

    await captureViewport({ hostElement, method: "dom" });

    const calls = vi.mocked(domToBlob).mock.calls as unknown as Array<[Node, { readonly width?: number }]>;
    expect(calls.at(-1)?.[1].width).toBe(640);
  });
});
