import { domToBlob } from "modern-screenshot";
import { getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import { SKETCH_LIMITS } from "./model.ts";
import { getPngDimensions } from "./raster.ts";

const DEFAULT_PROCESSING_TIMEOUT_MS = 10_000;

export type SketchCaptureErrorCode =
  | "unsupported"
  | "cancelled"
  | "capture-failed"
  | "processing-timeout";

export class SketchCaptureError extends Error {
  constructor(
    readonly code: SketchCaptureErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "SketchCaptureError";
  }
}

export interface CapturedSketch {
  readonly originalImage: Blob;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly capture: {
    readonly url: string;
    readonly title: string;
    readonly timestamp: number;
    readonly viewportWidth: number;
    readonly viewportHeight: number;
    readonly scrollX: number;
    readonly scrollY: number;
    readonly devicePixelRatio: number;
    readonly host: string;
    readonly framework: string;
    readonly imageWidth: number;
    readonly imageHeight: number;
  };
}

export interface SketchCaptureOptions {
  readonly hostElement: HTMLElement;
  readonly signal?: AbortSignal;
  readonly processingTimeoutMs?: number;
}

function abortError(): SketchCaptureError {
  return new SketchCaptureError("cancelled", "Sketch capture was cancelled.");
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function waitForAnimationFrame(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const finish = (): void => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const onAbort = (): void => {
      signal?.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(finish);
    else setTimeout(finish, 16);
  });
}

async function waitForLayout(signal?: AbortSignal, targetDocument?: Document): Promise<void> {
  try {
    if (targetDocument?.fonts) await targetDocument.fonts.ready;
    else if (typeof document.fonts !== "undefined") await document.fonts.ready;
  } catch {
    // Font readiness is best effort; the animation-frame settle still runs.
  }
  await waitForAnimationFrame(signal);
  await waitForAnimationFrame(signal);
}

function domContentWidth(hostElement: HTMLElement): number {
  const panel = hostElement.shadowRoot?.querySelector<HTMLElement>('.panel[data-open="true"]');
  const panelRect = panel?.getBoundingClientRect();
  if (!panelRect || panelRect.width <= 0) return Math.max(1, Math.round(window.innerWidth));
  return Math.max(1, Math.min(Math.round(window.innerWidth), Math.round(panelRect.left)));
}

export interface SketchViewport {
  readonly width: number;
  readonly height: number;
  readonly scrollX: number;
  readonly scrollY: number;
  /** Screen-space placement of the renderer iframe inside the editor. */
  readonly offsetX: number;
  readonly offsetY: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
}

interface SketchSurface {
  readonly document: Document;
  readonly window: Window;
  readonly iframe: HTMLIFrameElement | null;
}

export interface SketchScrollPosition {
  readonly x: number;
  readonly y: number;
}

function nonNegativeOffset(...values: readonly number[]): number {
  return Math.max(0, ...values.filter((value) => Number.isFinite(value)));
}

/** Reads root scrolling from both window and document APIs. */
export function getSketchScrollPosition(targetWindow: Window): SketchScrollPosition {
  const targetDocument = targetWindow.document;
  const scrollingElement = targetDocument.scrollingElement;
  return {
    x: nonNegativeOffset(
      targetWindow.scrollX,
      targetWindow.pageXOffset,
      scrollingElement?.scrollLeft ?? 0,
      targetDocument.documentElement?.scrollLeft ?? 0,
      targetDocument.body?.scrollLeft ?? 0,
    ),
    y: nonNegativeOffset(
      targetWindow.scrollY,
      targetWindow.pageYOffset,
      scrollingElement?.scrollTop ?? 0,
      targetDocument.documentElement?.scrollTop ?? 0,
      targetDocument.body?.scrollTop ?? 0,
    ),
  };
}

function getSketchSurface(hostElement: HTMLElement): SketchSurface {
  const iframe = typeof HTMLIFrameElement !== "undefined" && hostElement instanceof HTMLIFrameElement
    ? hostElement
    : null;
  if (iframe?.contentDocument && iframe.contentWindow) {
    return { document: iframe.contentDocument, window: iframe.contentWindow, iframe };
  }
  const ownerDocument = hostElement.ownerDocument ?? document;
  return {
    document: ownerDocument,
    window: ownerDocument.defaultView ?? window,
    iframe: null,
  };
}

export function getSketchViewport(hostElement: HTMLElement): SketchViewport {
  const surface = getSketchSurface(hostElement);
  const scroll = getSketchScrollPosition(surface.window);
  if (surface.iframe) {
    const rect = surface.iframe.getBoundingClientRect();
    return {
      width: Math.max(1, Math.round(surface.window.innerWidth || surface.iframe.clientWidth || rect.width)),
      height: Math.max(1, Math.round(surface.window.innerHeight || surface.iframe.clientHeight || rect.height)),
      scrollX: scroll.x,
      scrollY: scroll.y,
      offsetX: rect.left,
      offsetY: rect.top,
      displayWidth: Math.max(1, rect.width),
      displayHeight: Math.max(1, rect.height),
    };
  }
  const width = domContentWidth(hostElement);
  const height = Math.max(1, Math.round(surface.window.innerHeight));
  return {
    width,
    height,
    scrollX: scroll.x,
    scrollY: scroll.y,
    offsetX: 0,
    offsetY: 0,
    displayWidth: width,
    displayHeight: height,
  };
}

function domViewportDimensions(hostElement: HTMLElement): { width: number; height: number; scale: number } {
  const surface = getSketchSurface(hostElement);
  const { width, height } = getSketchViewport(hostElement);
  const devicePixelRatio = Math.max(1, surface.window.devicePixelRatio || 1);
  const scale = Math.min(devicePixelRatio, SKETCH_LIMITS.imageEdge / Math.max(width, height));
  return { width, height, scale };
}

function domBackgroundColor(targetDocument: Document): string | null {
  const color = targetDocument.defaultView?.getComputedStyle(targetDocument.body).backgroundColor;
  return color && color !== "transparent" && color !== "rgba(0, 0, 0, 0)" ? color : null;
}

function prepareDomClone(node: Node): void {
  if (!(node instanceof HTMLElement)) return;
  if (node.localName === "html") node.removeAttribute("data-nudge-ui-panel");
  if (node.localName === "body") node.style.setProperty("margin-right", "0", "important");
}

async function runWithProcessingTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let onParentAbort: (() => void) | null = null;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<T>((_, reject) => {
        onParentAbort = () => {
          reject(abortError());
          controller.abort();
        };
        if (parentSignal?.aborted) {
          onParentAbort();
          return;
        }
        parentSignal?.addEventListener("abort", onParentAbort, { once: true });
      }),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new SketchCaptureError(
            "processing-timeout",
            "The selected tab took too long to prepare. Try capturing again.",
          ));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (onParentAbort && parentSignal) parentSignal.removeEventListener("abort", onParentAbort);
    controller.abort();
  }
}

async function captureDomFrame(
  options: SketchCaptureOptions,
  signal?: AbortSignal,
): Promise<{ readonly blob: Blob; readonly width: number; readonly height: number }> {
  const surface = getSketchSurface(options.hostElement);
  const viewport = domViewportDimensions(options.hostElement);
  let scale = viewport.scale;

  for (let attempt = 0; attempt < 7; attempt += 1) {
    assertNotAborted(signal);
    const blob = await domToBlob(surface.document.documentElement, {
      type: "image/png",
      width: viewport.width,
      height: viewport.height,
      scale,
      backgroundColor: domBackgroundColor(surface.document),
      style: {
        width: `${viewport.width}px`,
        height: `${viewport.height}px`,
        overflow: "hidden",
      },
      filter: (node) => node !== options.hostElement,
      features: { restoreScrollPosition: true },
      timeout: DEFAULT_PROCESSING_TIMEOUT_MS,
      onCloneEachNode: prepareDomClone,
    });
    assertNotAborted(signal);

    const dimensions = await getPngDimensions(blob);
    if (!dimensions
      || dimensions.width > SKETCH_LIMITS.imageEdge
      || dimensions.height > SKETCH_LIMITS.imageEdge) {
      throw new SketchCaptureError("capture-failed", "The rendered viewport produced an invalid image.");
    }
    if (blob.size <= SKETCH_LIMITS.imageBytes) {
      return { blob, width: dimensions.width, height: dimensions.height };
    }
    scale *= 0.8;
  }

  throw new SketchCaptureError("capture-failed", "This viewport is too detailed to save within the 2 MiB image limit.");
}

/** Renders the current viewport from its DOM without invoking screen capture permissions. */
export async function captureViewport(options: SketchCaptureOptions): Promise<CapturedSketch> {
  if (typeof document === "undefined" || typeof window === "undefined") {
    throw new SketchCaptureError("unsupported", "Viewport capture is only available in a browser.");
  }
  assertNotAborted(options.signal);

  try {
    const surface = getSketchSurface(options.hostElement);
    const frame = await runWithProcessingTimeout(async (processingSignal) => {
      await waitForLayout(processingSignal, surface.document);
      return captureDomFrame(options, processingSignal);
    }, options.processingTimeoutMs ?? DEFAULT_PROCESSING_TIMEOUT_MS, options.signal);
    assertNotAborted(options.signal);

    const runtime = getNudgeUiRuntimeConfig();
    const scroll = getSketchScrollPosition(surface.window);
    const capture = {
      url: surface.window.location.href,
      title: surface.document.title,
      timestamp: Date.now(),
      viewportWidth: surface.window.innerWidth,
      viewportHeight: surface.window.innerHeight,
      scrollX: scroll.x,
      scrollY: scroll.y,
      devicePixelRatio: surface.window.devicePixelRatio || 1,
      host: runtime.host,
      framework: runtime.framework,
      imageWidth: frame.width,
      imageHeight: frame.height,
    } as const;
    return { originalImage: frame.blob, imageWidth: frame.width, imageHeight: frame.height, capture };
  } catch (error) {
    if (error instanceof SketchCaptureError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw abortError();
    throw new SketchCaptureError("capture-failed", "The viewport could not be rendered from the page DOM. Try again.", { cause: error });
  }
}

export function createSketchCaptureOperation(options: SketchCaptureOptions): {
  readonly promise: Promise<CapturedSketch>;
  readonly cancel: () => void;
} {
  const controller = new AbortController();
  const onAbort = (): void => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  const promise = captureViewport({
    ...options,
    signal: controller.signal,
  }).finally(() => options.signal?.removeEventListener("abort", onAbort));
  return { promise, cancel: () => controller.abort() };
}
