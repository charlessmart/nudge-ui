import { NUDGE_UI_MOUNT_ID } from "../../../transport/routes.ts";
import { setSketchMarksCapturing } from "./marksStore.ts";
import { requestDisplayCapture, type DisplayCapture } from "../../sketch/displayCapture.ts";
import {
  findScreenMarkers,
  screenMarkersCleared,
  SCREEN_MARKER_SIZE,
  SCREEN_MARKER_COLOR,
  type MarkerColor,
  type PixelImage,
  type PixelRect,
} from "../../sketch/screenMarkers.ts";
import { getTabCaptureSource, type TabCaptureSource } from "../../sketch/tabCapture.ts";

/** How long to look for the markers, or for a frame without them, before giving up. */
const MARKER_DEADLINE_MS = 2_000;
/** A browser that scales the tab's two axes differently has captured something other than this page. */
const MAX_AXIS_SCALE_DIFFERENCE = 0.02;

/**
 * Hides Nudge UI's controls and overlays, keeping the board, the cards, their marks and the panel (which the crop leaves
 * out anyway, so it stays put instead of flashing). Structural, so a new overlay is hidden without being listed.
 */
const CAPTURE_STYLES = `
:host > :not(.canvas-workspace):not(.panel):not(.sketch-marks):not(.screen-marker):not(style),
.canvas-workspace > :not(.canvas-workspace__board),
.canvas-workspace__board > :not(.canvas-workspace__board-content),
.canvas-workspace__board-content > :not(.canvas-card),
.canvas-card > :not(.canvas-card__frame),
.canvas-card__frame > :not(.canvas-card__iframe):not(.sketch-marks) {
  visibility: hidden !important;
}
.canvas-card__frame {
  outline: none !important;
  animation: none !important;
}
`;

/** A rectangle of the tab in CSS pixels. */
export interface ScreenshotArea {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * A taken screenshot: the cropped picture, ready to show at once, and its PNG, which finishes encoding afterwards. The
 * area is where on screen the picture was taken, so it can be animated away from there.
 */
export interface SketchScreenshot {
  readonly picture: HTMLCanvasElement;
  readonly image: Promise<Blob>;
  readonly area: ScreenshotArea;
}

type Area = ScreenshotArea;

function inspectorRoot(win: Window): ShadowRoot | null {
  return win.document.getElementById(NUDGE_UI_MOUNT_ID)?.shadowRoot ?? null;
}

/** The part of the tab a screenshot shows: all of it but the open panel, in whole CSS pixels. */
function screenshotArea(win: Window): Area {
  let left = 0;
  let right = win.innerWidth;
  const panel = inspectorRoot(win)?.querySelector<HTMLElement>('.panel[data-open="true"]')?.getBoundingClientRect();
  if (panel && panel.width > 0) {
    if (panel.left + panel.width / 2 > win.innerWidth / 2) right = Math.min(right, panel.left);
    else left = Math.max(left, panel.right);
  }
  const top = 0;
  const bottom = win.innerHeight;
  return {
    left: Math.ceil(left),
    top,
    width: Math.max(1, Math.floor(right) - Math.ceil(left)),
    height: Math.max(1, Math.floor(bottom) - top),
  };
}

function nextPaint(win: Window): Promise<void> {
  return new Promise((resolve) => {
    win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve()));
  });
}

/** Leaves only the page, the board and the marks on screen; the returned function puts the controls back. */
function hideInspector(win: Window): () => void {
  const root = inspectorRoot(win);
  const style = win.document.createElement("style");
  style.textContent = CAPTURE_STYLES;
  root?.append(style);
  // The sketch surface is hidden with the rest, so the frame it was drawing on shows its marks in the passive layer.
  setSketchMarksCapturing(true);
  return () => {
    style.remove();
    setSketchMarksCapturing(false);
  };
}

interface ScreenMarkers {
  /** Moves the markers to the corners of `area`. */
  place(area: Area): void;
  remove(): void;
}

function showMarkers(win: Window, color: MarkerColor): ScreenMarkers {
  const root = inspectorRoot(win) ?? win.document.body;
  const markers = Array.from({ length: 4 }, () => {
    const marker = win.document.createElement("div");
    marker.className = "screen-marker";
    marker.setAttribute("aria-hidden", "true");
    Object.assign(marker.style, {
      position: "fixed",
      width: `${SCREEN_MARKER_SIZE}px`,
      height: `${SCREEN_MARKER_SIZE}px`,
      background: `rgb(${color.join(" ")})`,
      zIndex: "2147483647",
      pointerEvents: "none",
    });
    root.append(marker);
    return marker;
  });
  return {
    place(area) {
      const right = area.left + area.width - SCREEN_MARKER_SIZE;
      const bottom = area.top + area.height - SCREEN_MARKER_SIZE;
      [[area.left, area.top], [right, area.top], [area.left, bottom], [right, bottom]].forEach(([left, top], index) => {
        Object.assign(markers[index]!.style, { left: `${left}px`, top: `${top}px` });
      });
    },
    remove() {
      for (const marker of markers) marker.remove();
    },
  };
}

function sameArea(first: Area, second: Area): boolean {
  return first.left === second.left && first.top === second.top
    && first.width === second.width && first.height === second.height;
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The screenshot could not be encoded."));
    }, "image/png");
  });
}

function cropPixels(win: Window, image: PixelImage, rect: PixelRect): HTMLCanvasElement {
  const canvas = win.document.createElement("canvas");
  canvas.width = rect.width;
  canvas.height = rect.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The screenshot could not be drawn.");
  // SAFETY: a frame read from the stream is an ImageData; the narrower type only keeps the marker search testable.
  context.putImageData(image as ImageData, -rect.x, -rect.y, rect.x, rect.y, rect.width, rect.height);
  return canvas;
}

/** Encoding waits for nothing on screen: the UI is back and the share has ended before it starts. */
function screenshotOf(picture: HTMLCanvasElement, area: Area): SketchScreenshot {
  const image = canvasToPng(picture);
  image.catch(() => undefined);
  return { picture, image, area };
}

async function untilFound<T>(attempt: () => Promise<T | null>): Promise<T | null> {
  const deadline = performance.now() + MARKER_DEADLINE_MS;
  do {
    const found = await attempt();
    if (found) return found;
  } while (performance.now() < deadline);
  return null;
}

/**
 * Finds the page in the shared picture with corner markers, then takes the first frame without them. That frame is
 * known to be newer than the hidden controls, and the markers say exactly where to crop it.
 */
async function captureShared(win: Window, capture: DisplayCapture): Promise<SketchScreenshot> {
  let picture: HTMLCanvasElement;
  let area: Area;
  try {
    // Chromium's sharing bar can resize the tab as the share starts; let the layout settle first.
    await nextPaint(win);
    const restore = hideInspector(win);
    try {
      let marked = screenshotArea(win);
      const color = SCREEN_MARKER_COLOR;
      const markers = showMarkers(win, color);
      markers.place(marked);
      let found: PixelRect | null;
      try {
        // Chromium's sharing bar can slide in after the markers are up and shorten the tab, which would leave the bottom
        // markers off screen. Each attempt measures again and follows the tab, so a late resize costs a frame, not the
        // screenshot.
        found = await untilFound(async () => {
          await capture.nextFrame();
          const now = screenshotArea(win);
          if (!sameArea(now, marked)) {
            marked = now;
            markers.place(marked);
            return null;
          }
          return findScreenMarkers(capture.read(), marked, color);
        });
      } finally {
        markers.remove();
      }
      area = marked;
      if (!found) {
        throw new Error("The page could not be found in what was shared. Share this tab, or a window or screen where the page is fully visible, and try again.");
      }
      const rect = found;
      const scale = rect.width / area.width;
      const image = await untilFound(async () => {
        await capture.nextFrame();
        const frame = capture.read();
        return screenMarkersCleared(frame, rect, scale, color) ? frame : null;
      });
      if (!image) throw new Error("The shared screen stopped updating. Try again.");
      picture = cropPixels(win, image, rect);
    } finally {
      restore();
    }
  } finally {
    capture.stop();
  }
  return screenshotOf(picture, area);
}

/** The extension pictures exactly the visible tab, so the crop follows from the window's size. */
async function captureTab(win: Window, source: TabCaptureSource): Promise<SketchScreenshot> {
  const restore = hideInspector(win);
  let tab: ImageBitmap;
  let area: Area;
  try {
    await nextPaint(win);
    area = screenshotArea(win);
    tab = await source.capture();
  } finally {
    restore();
  }
  try {
    const scaleX = tab.width / Math.max(1, win.innerWidth);
    const scaleY = tab.height / Math.max(1, win.innerHeight);
    if (Math.abs(scaleX - scaleY) > Math.max(scaleX, scaleY) * MAX_AXIS_SCALE_DIFFERENCE) {
      throw new Error("The captured image does not match this tab's shape.");
    }
    const canvas = win.document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(area.width * scaleX));
    canvas.height = Math.max(1, Math.round(area.height * scaleY));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The screenshot could not be drawn.");
    context.drawImage(tab, area.left * scaleX, area.top * scaleY, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    return screenshotOf(canvas, area);
  } finally {
    tab.close();
  }
}

/**
 * A PNG of the tab as the user sees it, with their marks and without Nudge UI. Call it straight from the click: without
 * the extension it asks the browser to share the screen, which Safari and Firefox allow only inside a user gesture.
 */
export function takeSketchScreenshot(win: Window = window): Promise<SketchScreenshot> {
  const source = getTabCaptureSource();
  if (source) return captureTab(win, source);
  return requestDisplayCapture(win).then((capture) => captureShared(win, capture));
}
