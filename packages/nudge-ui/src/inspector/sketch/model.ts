/** Per frame, so one page's marks stay quick to draw and to hit-test. */
export const SKETCH_LIMITS = {
  strokes: 500,
  points: 20_000,
  text: 500,
} as const;

export const SKETCH_STROKE_WIDTH = 6;
/** Shared by every shape tool: rectangle, circle and arrow. */
export const SKETCH_RECTANGLE_STROKE_WIDTH = 4;
export const SKETCH_RECTANGLE_FILL_OPACITY = 0.1;
/** Text layers have no line; their width is twice the padding of the white note behind the words, as a multiple of the font size. */
export const SKETCH_TEXT_PADDING_EM = 0.35;
export const SKETCH_TEXT_FONT_SIZE = 18;
export const SKETCH_TEXT_FONT_FAMILY = "system-ui, -apple-system, sans-serif";
export const SKETCH_TEXT_FONT_WEIGHT = 500;
/** Line height as a multiple of the font size. */
export const SKETCH_TEXT_LINE_HEIGHT = 1.25;
export const SKETCH_TEXT_MIN_FONT_SIZE = 8;
export const SKETCH_TEXT_MAX_FONT_SIZE = 512;
/** The pen color a new stroke starts with: the brand red. */
export const SKETCH_STROKE_COLOR = "#ff2600";
/** Selection frame; independent of the chosen pen color. */
export const SKETCH_ACCENT_COLOR = "#0096ff";
/** Ordered clockwise around the toolbar's swatch picker. */
export const SKETCH_PEN_COLORS = [
  { id: "red", name: "Red", value: SKETCH_STROKE_COLOR },
  { id: "orange", name: "Orange", value: "#ff8a00" },
  { id: "blue", name: "Blue", value: "#0096ff" },
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

export type SketchStrokeKind = "freehand" | "rectangle" | "ellipse" | "arrow" | "text";

/** Kinds that are drawn by dragging out two corners, and that keep a closed or open shape of their own. */
export function isSketchShapeKind(kind: SketchStrokeKind): kind is "rectangle" | "ellipse" | "arrow" {
  return kind === "rectangle" || kind === "ellipse" || kind === "arrow";
}

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
