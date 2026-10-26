export const SKETCH_SCHEMA_VERSION = 2 as const;
export const SKETCH_DATABASE_NAME = "nudge-ui-sketches";
export const SKETCH_DATABASE_VERSION = 2;
export const SKETCH_DOCUMENTS_STORE = "documents";

export const SKETCH_LIMITS = {
  /** Sketches are kept only so a recent copy can be copied again, so this is deliberately small. */
  keptSketches: 3,
  imageEdge: 2_048,
  imageBytes: 2 * 1024 * 1024,
  strokes: 500,
  points: 20_000,
  text: 500,
  url: 2_048,
} as const;

export const SKETCH_STROKE_WIDTH = 6;
export const SKETCH_RECTANGLE_STROKE_WIDTH = 4;
export const SKETCH_RECTANGLE_FILL_OPACITY = 0.1;
/** Text layers have no line; this only sets the gap their selection frame keeps from the glyphs. */
export const SKETCH_TEXT_STROKE_WIDTH = 2;
export const SKETCH_TEXT_FONT_SIZE = 24;
export const SKETCH_TEXT_FONT_FAMILY = "system-ui, -apple-system, sans-serif";
export const SKETCH_TEXT_FONT_WEIGHT = 500;
/** Line height as a multiple of the font size. */
export const SKETCH_TEXT_LINE_HEIGHT = 1.25;
export const SKETCH_TEXT_MIN_FONT_SIZE = 8;
export const SKETCH_TEXT_MAX_FONT_SIZE = 512;
export const SKETCH_STROKE_COLOR = "#0096ff";
/** Selection frame; independent of the chosen pen color. */
export const SKETCH_ACCENT_COLOR = "#0096ff";
/** Ordered clockwise around the toolbar's swatch picker. */
export const SKETCH_PEN_COLORS = [
  { id: "red", name: "Red", value: "#f03e1e" },
  { id: "orange", name: "Orange", value: "#ff8a00" },
  { id: "blue", name: "Blue", value: SKETCH_STROKE_COLOR },
  { id: "black", name: "Black", value: "#242424" },
  { id: "yellow", name: "Yellow", value: "#ffc800" },
  { id: "green", name: "Green", value: "#1fc85a" },
] as const;
export type SketchPenColor = (typeof SKETCH_PEN_COLORS)[number];

export interface SketchPoint {
  readonly x: number;
  readonly y: number;
}

export type SketchStrokeColor = SketchPenColor["value"];

export type SketchStrokeKind = "freehand" | "rectangle" | "text";

export interface SketchStroke {
  readonly id: string;
  readonly kind: SketchStrokeKind;
  readonly width: number;
  readonly color: SketchStrokeColor;
  readonly points: readonly SketchPoint[];
  /**
   * Orientation of the selection frame in radians. `points` already include the
   * rotation, so this only keeps the frame hugging a rotated stroke.
   */
  readonly rotation?: number;
  /** Text layers only. `points` are the corners of the text box, closed like a rectangle. */
  readonly text?: string;
  readonly fontSize?: number;
}

/** A box in the saved image's pixels. */
export interface SketchInk {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SketchDocument {
  readonly schemaVersion: typeof SKETCH_SCHEMA_VERSION;
  readonly projectId: string;
  readonly id: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  /** The page or iteration the copy was taken from. */
  readonly url: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
  /** The PNG that is copied again; marks are already drawn into it. */
  readonly image: Blob;
  /** Where the marks are within the image, so a thumbnail can show them rather than the page behind them. Absent on older sketches. */
  readonly ink?: SketchInk;
}

interface CandidateDocument {
  readonly schemaVersion?: unknown;
  readonly projectId?: unknown;
  readonly id?: unknown;
  readonly createdAt?: unknown;
  readonly updatedAt?: unknown;
  readonly url?: unknown;
  readonly imageWidth?: unknown;
  readonly imageHeight?: unknown;
  readonly image?: unknown;
  readonly ink?: unknown;
}

function safeIntegerInRange(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function boundedString(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
  maximum: number,
): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function isBlob(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
  mimeType?: string,
): value is Blob {
  return typeof Blob !== "undefined"
    && value instanceof Blob
    && (mimeType === undefined || value.type === mimeType);
}

function validHttpUrl(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
  maximum: number,
): value is string {
  if (!boundedString(value, maximum)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isPlainObject(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSketchInk(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
  imageWidth: number,
  imageHeight: number,
): value is SketchInk {
  if (!isPlainObject(value)) return false;
  // SAFETY: the object check above makes reading optional candidate fields safe.
  const ink = value as { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
  return Object.keys(ink).every((key) => ["x", "y", "width", "height"].includes(key))
    && typeof ink.x === "number" && typeof ink.y === "number"
    && typeof ink.width === "number" && typeof ink.height === "number"
    && ink.x >= 0 && ink.y >= 0 && ink.width > 0 && ink.height > 0
    && ink.x + ink.width <= imageWidth && ink.y + ink.height <= imageHeight;
}

export function isSketchDocument(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
): value is SketchDocument {
  if (!isPlainObject(value)) return false;
  // SAFETY: the object check above makes reading optional candidate fields safe.
  const document = value as CandidateDocument;
  return Object.keys(document).every((key) => [
    "schemaVersion",
    "projectId",
    "id",
    "createdAt",
    "updatedAt",
    "url",
    "imageWidth",
    "imageHeight",
    "image",
    "ink",
  ].includes(key))
    && document.schemaVersion === SKETCH_SCHEMA_VERSION
    && boundedString(document.projectId, 256)
    && boundedString(document.id, 256)
    && safeIntegerInRange(document.createdAt, Number.MIN_SAFE_INTEGER)
    && safeIntegerInRange(document.updatedAt, Number.MIN_SAFE_INTEGER)
    && validHttpUrl(document.url, SKETCH_LIMITS.url)
    && safeIntegerInRange(document.imageWidth, 1, SKETCH_LIMITS.imageEdge)
    && safeIntegerInRange(document.imageHeight, 1, SKETCH_LIMITS.imageEdge)
    && isBlob(document.image, "image/png")
    && document.image.size > 0
    && document.image.size <= SKETCH_LIMITS.imageBytes
    && (document.ink === undefined || isSketchInk(document.ink, document.imageWidth, document.imageHeight));
}
