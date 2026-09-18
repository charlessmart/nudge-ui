import {
  SKETCH_ANNOTATION_RADIUS,
  SKETCH_LIMITS,
  SKETCH_STROKE_COLOR,
  type SketchAnnotation,
  type SketchPoint,
  type SketchStroke,
} from "./model.ts";

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
  // IHDR is the first chunk in every PNG. The dimensions are big-endian at
  // byte offsets 16 and 20 in the complete file.
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

export function drawSketchStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Pick<SketchStroke, "points" | "width">,
  scaleX = 1,
  scaleY = scaleX,
): void {
  if (stroke.points.length === 0) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = SKETCH_STROKE_COLOR;
  ctx.lineWidth = stroke.width * Math.max(scaleX, scaleY);
  drawPointPath(ctx, stroke.points, scaleX, scaleY);
  ctx.stroke();
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

export function drawSketchAnnotation(
  ctx: CanvasRenderingContext2D,
  annotation: Pick<SketchAnnotation, "number" | "point">,
  scaleX = 1,
  scaleY = scaleX,
): void {
  const scale = Math.max(scaleX, scaleY);
  const x = annotation.point.x * scaleX;
  const y = annotation.point.y * scaleY;
  const radius = SKETCH_ANNOTATION_RADIUS * scale;

  ctx.save();
  ctx.fillStyle = SKETCH_STROKE_COLOR;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${12 * scale}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(annotation.number), x, y);
  ctx.restore();
}

export function drawSketchAnnotations(
  ctx: CanvasRenderingContext2D,
  annotations: readonly SketchAnnotation[],
  scaleX = 1,
  scaleY = scaleX,
): void {
  for (const annotation of annotations) {
    drawSketchAnnotation(ctx, annotation, scaleX, scaleY);
  }
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

/** Renders the immutable screenshot and committed strokes into one PNG. */
export async function renderAnnotatedPng(
  originalImage: Blob,
  imageWidth: number,
  imageHeight: number,
  strokes: readonly SketchStroke[],
  annotations: readonly SketchAnnotation[] = [],
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
    drawSketchAnnotations(context, annotations);
    const result = await canvasPng(canvas);
    if (result.size > SKETCH_LIMITS.imageBytes) {
      throw new Error("This sketch is too detailed to save within the 2 MiB image limit.");
    }
    return { blob: result, width: imageWidth, height: imageHeight };
  } finally {
    image.close();
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  if (typeof btoa !== "function") throw new Error("This browser cannot prepare sketch attachments.");
  return btoa(binary);
}

export async function copyImageToClipboard(blob: Blob): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Image clipboard access is unavailable. Use Download image instead.");
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

export async function copyImageAndTextToClipboard(blob: Blob, text: string): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Combined image and text clipboard access is unavailable. Copy the prompt and image separately.");
  }
  await navigator.clipboard.write([
    new ClipboardItem({
      "image/png": blob,
      "text/plain": new Blob([text], { type: "text/plain" }),
    }),
  ]);
}

export function downloadImage(blob: Blob, filename: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
