import { textLayout } from "./text.ts";
import {
  SKETCH_LIMITS,
  SKETCH_RECTANGLE_FILL_OPACITY,
  SKETCH_STROKE_COLOR,
  type SketchPoint,
  type SketchStroke,
} from "./model.ts";
import { sketchStrokeOutline } from "./freehand.tsx";

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

export interface PngDimensions {
  readonly width: number;
  readonly height: number;
}

export function readPngDimensions(bytes: Uint8Array): PngDimensions | null {
  if (bytes.length < 24) return null;
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) return null;
  }
  // IHDR is the first chunk; dimensions are big-endian at byte offsets 16 and 20.
  if (bytes[12] !== 73 || bytes[13] !== 72 || bytes[14] !== 68 || bytes[15] !== 82) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (!width || !height) return null;
  return { width, height };
}

export async function getPngDimensions(blob: Blob): Promise<PngDimensions | null> {
  return readPngDimensions(new Uint8Array(await blob.slice(0, 24).arrayBuffer()));
}

export async function validatePngBlob(
  blob: Blob,
  expected?: PngDimensions,
): Promise<PngDimensions> {
  if (blob.type !== "image/png" || blob.size <= 0 || blob.size > SKETCH_LIMITS.imageBytes) {
    throw new Error("Sketch images must be PNG files smaller than 2 MiB.");
  }
  const dimensions = await getPngDimensions(blob);
  if (!dimensions
    || dimensions.width > SKETCH_LIMITS.imageEdge
    || dimensions.height > SKETCH_LIMITS.imageEdge) {
    throw new Error("Sketch images must be valid PNGs no larger than 2048 pixels on an edge.");
  }
  if (expected && (expected.width !== dimensions.width || expected.height !== dimensions.height)) {
    throw new Error("The sketch image dimensions do not match its capture metadata.");
  }
  return dimensions;
}

function drawPointPath(ctx: CanvasRenderingContext2D, points: readonly SketchPoint[], scaleX: number, scaleY: number): void {
  const first = points[0];
  if (!first) return;
  ctx.beginPath();
  ctx.moveTo(first.x * scaleX, first.y * scaleY);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]!;
    ctx.lineTo(point.x * scaleX, point.y * scaleY);
  }
  if (points.length === 1) {
    ctx.lineTo(first.x * scaleX + 0.01, first.y * scaleY + 0.01);
  }
}

function drawSketchText(
  ctx: CanvasRenderingContext2D,
  stroke: Pick<SketchStroke, "points" | "width"> & Partial<Pick<SketchStroke, "color" | "text" | "fontSize" | "rotation">>,
  scaleX: number,
  scaleY: number,
): void {
  const { frame, lines, lineHeight, font } = textLayout(stroke, scaleX, scaleY);
  ctx.translate(frame.center.x * scaleX, frame.center.y * scaleY);
  ctx.rotate(frame.rotation);
  ctx.font = font;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = stroke.color || SKETCH_STROKE_COLOR;
  lines.forEach((line, index) => {
    ctx.fillText(line, (-frame.width / 2) * scaleX, (-frame.height / 2 + (index + 0.5) * lineHeight) * scaleY);
  });
}

export function drawSketchStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Pick<SketchStroke, "kind" | "points" | "width">
    & Partial<Pick<SketchStroke, "color" | "text" | "fontSize" | "rotation">>,
  scaleX = 1,
  scaleY = scaleX,
): void {
  if (stroke.points.length === 0) return;
  ctx.save();
  if (stroke.kind === "text") {
    drawSketchText(ctx, stroke, scaleX, scaleY);
  } else if (stroke.kind === "rectangle") {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const color = stroke.color || SKETCH_STROKE_COLOR;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = stroke.width * Math.max(scaleX, scaleY);
    drawPointPath(ctx, stroke.points, scaleX, scaleY);
    ctx.save();
    ctx.globalAlpha = SKETCH_RECTANGLE_FILL_OPACITY;
    ctx.fill();
    ctx.restore();
    ctx.stroke();
  } else {
    const outline = sketchStrokeOutline(stroke, scaleX, scaleY);
    const first = outline[0];
    if (first) {
      ctx.beginPath();
      ctx.moveTo(first[0], first[1]);
      for (const point of outline.slice(1)) ctx.lineTo(point[0], point[1]);
      ctx.closePath();
      ctx.fillStyle = stroke.color || SKETCH_STROKE_COLOR;
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawSketchStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: readonly SketchStroke[],
  scaleX = 1,
  scaleY = scaleX,
): void {
  for (const stroke of strokes) drawSketchStroke(ctx, stroke, scaleX, scaleY);
}

interface LoadedImage {
  readonly source: CanvasImageSource;
  readonly close: () => void;
}

async function loadImage(blob: Blob): Promise<LoadedImage> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return { source: bitmap, close: () => bitmap.close() };
  }
  if (typeof Image === "undefined" || typeof URL === "undefined") {
    throw new Error("This browser cannot decode sketch images.");
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("The sketch screenshot could not be decoded."));
      element.src = url;
    });
    return { source: image, close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The browser could not encode the sketch as PNG."));
    }, "image/png");
  });
}

export async function renderSketchPng(
  originalImage: Blob,
  imageWidth: number,
  imageHeight: number,
  strokes: readonly SketchStroke[],
): Promise<{ readonly blob: Blob; readonly width: number; readonly height: number }> {
  await validatePngBlob(originalImage, { width: imageWidth, height: imageHeight });
  if (typeof document === "undefined") throw new Error("Sketch rendering requires a browser document.");
  const image = await loadImage(originalImage);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = imageWidth;
    canvas.height = imageHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The browser could not create a sketch canvas.");
    context.drawImage(image.source, 0, 0, imageWidth, imageHeight);
    drawSketchStrokes(context, strokes);
    const result = await canvasPng(canvas);
    if (result.size > SKETCH_LIMITS.imageBytes) {
      throw new Error("This sketch is too detailed to save within the 2 MiB image limit.");
    }
    return { blob: result, width: imageWidth, height: imageHeight };
  } finally {
    image.close();
  }
}

/** The promise form lets callers start the write inside the user gesture (required by Safari). */
export async function copyImageToClipboard(blob: Blob | Promise<Blob>): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Image clipboard access is unavailable in this browser.");
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
