import { domToBlob } from "modern-screenshot";
import { getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import { SKETCH_LIMITS } from "./model.ts";
import { getPngDimensions } from "./raster.ts";

const DEFAULT_PROCESSING_TIMEOUT_MS = 10_000;

export type SketchCaptureErrorCode =
  | "unsupported"
  | "cancelled"
  | "permission-denied"
  | "wrong-surface"
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
  readonly method?: SketchCaptureMethod;
}

export type SketchCaptureMethod = "dom" | "screen";

interface CropTargetApi {
  readonly fromElement: (element: Element) => Promise<unknown>;
}

interface CropTrack extends MediaStreamTrack {
  cropTo?: (target: unknown) => Promise<void>;
}

interface CaptureMediaDevices {
  getDisplayMedia?: (constraints?: DisplayMediaStreamOptions & { readonly preferCurrentTab?: boolean }) => Promise<MediaStream>;
}

function cropTargetApi(): CropTargetApi | null {
  const candidate = (globalThis as typeof globalThis & { CropTarget?: CropTargetApi }).CropTarget;
  return candidate && typeof candidate.fromElement === "function" ? candidate : null;
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

function imageDimensions(width: number, height: number, scale: number): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
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
  if (surface.iframe) {
    const rect = surface.iframe.getBoundingClientRect();
    return {
      width: Math.max(1, Math.round(surface.window.innerWidth || surface.iframe.clientWidth || rect.width)),
      height: Math.max(1, Math.round(surface.window.innerHeight || surface.iframe.clientHeight || rect.height)),
      scrollX: Math.max(0, surface.window.scrollX || 0),
      scrollY: Math.max(0, surface.window.scrollY || 0),
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
    scrollX: Math.max(0, surface.window.scrollX || 0),
    scrollY: Math.max(0, surface.window.scrollY || 0),
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

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The browser could not encode the captured viewport."));
    }, "image/png");
  });
}

function disposeVideo(video: HTMLVideoElement | null): void {
  if (!video) return;
  video.pause();
  video.srcObject = null;
  video.remove();
}

async function captureVideoFrame(video: HTMLVideoElement, signal?: AbortSignal): Promise<{ blob: Blob; width: number; height: number }> {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) {
    throw new SketchCaptureError("capture-failed", "The selected tab did not provide a video frame.");
  }
  let scale = Math.min(1, SKETCH_LIMITS.imageEdge / Math.max(sourceWidth, sourceHeight));
  let result: Blob | null = null;
  let dimensions = imageDimensions(sourceWidth, sourceHeight, scale);
  for (let attempt = 0; attempt < 7; attempt += 1) {
    assertNotAborted(signal);
    dimensions = imageDimensions(sourceWidth, sourceHeight, scale);
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");
    if (!context) throw new SketchCaptureError("capture-failed", "The browser could not create a capture canvas.");
    context.drawImage(video, 0, 0, dimensions.width, dimensions.height);
    result = await canvasToPng(canvas);
    assertNotAborted(signal);
    if (result.size <= SKETCH_LIMITS.imageBytes || dimensions.width <= 1 || dimensions.height <= 1) break;
    scale *= 0.8;
  }
  if (!result || result.size > SKETCH_LIMITS.imageBytes) {
    throw new SketchCaptureError("capture-failed", "This viewport is too detailed to save within the 2 MiB image limit.");
  }
  return { blob: result, ...dimensions };
}

async function waitForVideoFrame(video: HTMLVideoElement, signal?: AbortSignal): Promise<void> {
  assertNotAborted(signal);
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (typeof video.requestVideoFrameCallback === "function") {
      video.requestVideoFrameCallback(() => finish());
    } else {
      setTimeout(finish, 50);
    }
  });
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

export function isSketchCaptureSupported(): { supported: boolean; reason?: string } {
  if (typeof document === "undefined" || typeof navigator === "undefined") {
    return { supported: false, reason: "Viewport capture is only available in a browser." };
  }
  const devices = navigator.mediaDevices as CaptureMediaDevices | undefined;
  if (!devices || typeof devices.getDisplayMedia !== "function") {
    return { supported: false, reason: "This browser does not support tab capture." };
  }
  if (!cropTargetApi()) {
    return { supported: false, reason: "This browser does not support current-tab region capture. Use a recent Chrome or Edge release." };
  }
  return { supported: true };
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
export async function captureViewportWithDom(options: SketchCaptureOptions): Promise<CapturedSketch> {
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
    const capture = {
      url: surface.window.location.href,
      title: surface.document.title,
      timestamp: Date.now(),
      viewportWidth: surface.window.innerWidth,
      viewportHeight: surface.window.innerHeight,
      scrollX: surface.window.scrollX,
      scrollY: surface.window.scrollY,
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

/**
 * Captures the current viewport through the browser's display-media picker.
 * The picker promise is intentionally not timed out: permission prompts can
 * remain open while the user decides. Processing is bounded after selection.
 */
export async function captureViewportWithScreenShare(options: SketchCaptureOptions): Promise<CapturedSketch> {
  const support = isSketchCaptureSupported();
  if (!support.supported) throw new SketchCaptureError("unsupported", support.reason!);
  assertNotAborted(options.signal);

  const devices = navigator.mediaDevices as CaptureMediaDevices;
  const getDisplayMedia = devices.getDisplayMedia;
  if (typeof getDisplayMedia !== "function") {
    throw new SketchCaptureError("unsupported", "This browser does not support tab capture.");
  }
  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;
  const surface = getSketchSurface(options.hostElement);
  const target = document.createElement("div");
  const previousPanelState = document.documentElement.getAttribute("data-nudge-ui-panel");
  const previousVisibility = options.hostElement.style.visibility;
  target.setAttribute("data-nudge-sketch-capture-target", "true");
  target.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;opacity:0;z-index:-2147483648;";
  document.body.appendChild(target);

  try {
    stream = await getDisplayMedia.call(devices, {
      video: {
        displaySurface: "browser",
      },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: "include",
      surfaceSwitching: "exclude",
    });
    assertNotAborted(options.signal);
    const track = stream.getVideoTracks()[0] as CropTrack | undefined;
    const displaySurface = track?.getSettings().displaySurface;
    if (!track || displaySurface !== "browser") {
      throw new SketchCaptureError("wrong-surface", "Choose this browser tab in the share dialog, not a window or monitor.");
    }
    const cropTarget = cropTargetApi();
    if (!cropTarget || typeof track.cropTo !== "function") {
      throw new SketchCaptureError("unsupported", "This browser cannot crop capture to the current tab viewport.");
    }

    await runWithProcessingTimeout(async (processingSignal) => {
      assertNotAborted(processingSignal);
      try {
        await track.cropTo!(await cropTarget.fromElement(surface.iframe ?? target));
      } catch (error) {
        if (processingSignal.aborted) throw abortError();
        throw new SketchCaptureError("wrong-surface", "Choose the current browser tab in the share dialog and try again.", { cause: error });
      }
      if (!surface.iframe) options.hostElement.style.visibility = "hidden";
      await waitForLayout(processingSignal);
      assertNotAborted(processingSignal);
      video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      video.style.display = "none";
      document.body.appendChild(video);
      await video.play();
      await waitForVideoFrame(video, processingSignal);
      await waitForAnimationFrame(processingSignal);
    }, options.processingTimeoutMs ?? DEFAULT_PROCESSING_TIMEOUT_MS, options.signal);

    assertNotAborted(options.signal);
    const frame = await runWithProcessingTimeout(
      (processingSignal) => captureVideoFrame(video!, processingSignal),
      options.processingTimeoutMs ?? DEFAULT_PROCESSING_TIMEOUT_MS,
      options.signal,
    );
    const runtime = getNudgeUiRuntimeConfig();
    const capture = {
      url: surface.window.location.href,
      title: surface.document.title,
      timestamp: Date.now(),
      viewportWidth: surface.window.innerWidth,
      viewportHeight: surface.window.innerHeight,
      scrollX: surface.window.scrollX,
      scrollY: surface.window.scrollY,
      devicePixelRatio: surface.window.devicePixelRatio || 1,
      host: runtime.host,
      framework: runtime.framework,
      imageWidth: frame.width,
      imageHeight: frame.height,
    } as const;
    return { originalImage: frame.blob, imageWidth: frame.width, imageHeight: frame.height, capture };
  } catch (error) {
    if (error instanceof SketchCaptureError) throw error;
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      throw new SketchCaptureError("permission-denied", "Capture was cancelled. Choose this browser tab to continue.", { cause: error });
    }
    throw new SketchCaptureError("capture-failed", "The viewport could not be captured. Try again.", { cause: error });
  } finally {
    disposeVideo(video as HTMLVideoElement | null);
    for (const track of stream?.getTracks() ?? []) track.stop();
    target.remove();
    options.hostElement.style.visibility = previousVisibility;
    if (previousPanelState !== null) document.documentElement.setAttribute("data-nudge-ui-panel", previousPanelState);
    else document.documentElement.removeAttribute("data-nudge-ui-panel");
  }
}

/** Captures a viewport using the requested method; DOM rendering is opt-in for API callers. */
export async function captureViewport(options: SketchCaptureOptions): Promise<CapturedSketch> {
  return options.method === "dom"
    ? captureViewportWithDom(options)
    : captureViewportWithScreenShare(options);
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
