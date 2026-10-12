import type {
  AgentSketchCaptureMetadata,
  AgentSketchMetadata,
} from "../agent/protocol.ts";

export const SKETCH_SCHEMA_VERSION = 1 as const;
export const SKETCH_DATABASE_NAME = "nudge-ui-sketches";
export const SKETCH_DATABASE_VERSION = 1;
export const SKETCH_DOCUMENTS_STORE = "documents";
export const SKETCH_HANDOFFS_STORE = "handoffs";

export const SKETCH_LIMITS = {
  completedSketches: 4,
  imageEdge: 2_048,
  imageBytes: 2 * 1024 * 1024,
  projectBytes: 20 * 1024 * 1024,
  strokes: 500,
  points: 20_000,
  annotations: 50,
  description: 2_000,
  url: 2_048,
  title: 512,
} as const;

export const SKETCH_STROKE_WIDTH = 6;
/** Drawn rectangles use a lighter outline than the freehand pen. */
export const SKETCH_RECTANGLE_STROKE_WIDTH = 4;
/** Opacity of the tint inside a drawn rectangle, in the rectangle's own color. */
export const SKETCH_RECTANGLE_FILL_OPACITY = 0.1;
/** Default pen color, and the fallback for strokes saved without one. */
export const SKETCH_STROKE_COLOR = "#0096ff";
/** Annotation markers and the notes panel; independent of the chosen pen color. */
export const SKETCH_ACCENT_COLOR = "#0096ff";
export const SKETCH_STROKE_OUTLINE = "";
/** Pen palette offered by the canvas toolbar, in clockwise order around its swatch picker. */
export const SKETCH_PEN_COLORS = [
  { id: "red", name: "Red", value: "#f03e1e" },
  { id: "orange", name: "Orange", value: "#ff8a00" },
  { id: "blue", name: "Blue", value: SKETCH_STROKE_COLOR },
  { id: "black", name: "Black", value: "#242424" },
  { id: "yellow", name: "Yellow", value: "#ffc800" },
  { id: "green", name: "Green", value: "#1fc85a" },
] as const;
export type SketchPenColor = (typeof SKETCH_PEN_COLORS)[number];
export const SKETCH_ANNOTATION_RADIUS = 16;

// Keep accepting sketches saved before the annotation color update. Existing
// PNGs remain unchanged until a user edits and saves them again.
const LEGACY_SKETCH_STROKE_COLOR = "#ef4444";
const LEGACY_SKETCH_STROKE_OUTLINE = "#111827";

export type SketchStatus = "pending" | "dispatching" | "handing-off" | "needs-review" | "unknown";
export type SketchTransport = "local" | "clipboard" | "direct";
export type SketchHandoffState = SketchStatus;

export interface SketchPoint {
  readonly x: number;
  readonly y: number;
}

export type SketchStrokeColor =
  | SketchPenColor["value"]
  | typeof LEGACY_SKETCH_STROKE_COLOR;
type SketchStrokeOutline = typeof SKETCH_STROKE_OUTLINE | typeof LEGACY_SKETCH_STROKE_OUTLINE;

export type SketchStrokeKind = "freehand" | "rectangle";

export interface SketchStroke {
  readonly id: string;
  /** Optional for compatibility with strokes saved before movable layers. */
  readonly kind?: SketchStrokeKind;
  readonly width: number;
  readonly color: SketchStrokeColor;
  readonly outlineColor: SketchStrokeOutline;
  readonly points: readonly SketchPoint[];
}

export interface SketchAnnotation {
  readonly id: string;
  readonly number: number;
  readonly point: SketchPoint;
  readonly description: string;
}

export interface SketchCaptureMetadata extends AgentSketchCaptureMetadata {
  readonly imageWidth: number;
  readonly imageHeight: number;
}

export interface SketchDocument {
  readonly schemaVersion: typeof SKETCH_SCHEMA_VERSION;
  readonly projectId: string;
  readonly id: string;
  readonly revision: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly capture: SketchCaptureMetadata;
  readonly description: string;
  readonly strokes: readonly SketchStroke[];
  /** Optional for compatibility with sketches saved before annotations existed. */
  readonly annotations?: readonly SketchAnnotation[];
  /**
   * Size of `annotatedImage`, which can be taller than the capture when a
   * notes panel is appended. `capture.imageWidth`/`imageHeight` size the
   * original screenshot and the stroke coordinate space.
   */
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly originalByteSize: number;
  readonly annotatedByteSize: number;
  readonly filename: string;
  readonly originalImage: Blob;
  readonly annotatedImage: Blob;
}

export interface SketchHandoffRecord {
  readonly id: string;
  readonly projectId: string;
  readonly sketchId: string;
  readonly sketchRevision: number;
  readonly localBatchId: string;
  readonly batchRevision?: number;
  readonly transport: SketchTransport;
  readonly agentRequestId?: string;
  readonly timestamp: number;
  readonly state: SketchHandoffState;
}

export interface SketchQueueItem {
  readonly document: SketchDocument;
  readonly handoff: SketchHandoffRecord | null;
  readonly status: SketchStatus;
}

export function createSketchFilename(id: string, revision: number): string {
  return `sketch-${id}-r${revision}.png`;
}

// Fields of stored records that have not been validated yet.
interface CandidateCapture {
  readonly url?: unknown;
  readonly title?: unknown;
  readonly timestamp?: unknown;
  readonly viewportWidth?: unknown;
  readonly viewportHeight?: unknown;
  readonly scrollX?: unknown;
  readonly scrollY?: unknown;
  readonly devicePixelRatio?: unknown;
  readonly host?: unknown;
  readonly framework?: unknown;
  readonly imageWidth?: unknown;
  readonly imageHeight?: unknown;
}

interface CandidatePoint {
  readonly x?: unknown;
  readonly y?: unknown;
}

interface CandidateAnnotation {
  readonly id?: unknown;
  readonly number?: unknown;
  readonly point?: unknown;
  readonly description?: unknown;
}

interface CandidateStroke {
  readonly id?: unknown;
  readonly kind?: unknown;
  readonly width?: unknown;
  readonly color?: unknown;
  readonly outlineColor?: unknown;
  readonly points?: unknown;
}

interface CandidateDocument {
  readonly schemaVersion?: unknown;
  readonly projectId?: unknown;
  readonly id?: unknown;
  readonly revision?: unknown;
  readonly createdAt?: unknown;
  readonly updatedAt?: unknown;
  readonly capture?: unknown;
  readonly description?: unknown;
  readonly strokes?: unknown;
  readonly annotations?: unknown;
  readonly imageWidth?: unknown;
  readonly imageHeight?: unknown;
  readonly originalByteSize?: unknown;
  readonly annotatedByteSize?: unknown;
  readonly filename?: unknown;
  readonly originalImage?: unknown;
  readonly annotatedImage?: unknown;
}

interface CandidateHandoff {
  readonly id?: unknown;
  readonly projectId?: unknown;
  readonly sketchId?: unknown;
  readonly sketchRevision?: unknown;
  readonly localBatchId?: unknown;
  readonly batchRevision?: unknown;
  readonly transport?: unknown;
  readonly agentRequestId?: unknown;
  readonly timestamp?: unknown;
  readonly state?: unknown;
}

export function isFiniteNumber(
  // Stored sketch fields are untrusted until this check narrows them.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function safeIntegerInRange(
  // Stored sketch fields are untrusted until this check narrows them.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function boundedString(
  // Stored sketch fields are untrusted until this check narrows them.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
  maximum: number,
  allowEmpty = false,
): value is string {
  return typeof value === "string" && value.length <= maximum && (allowEmpty || value.length > 0);
}

function isBlob(
  // Stored sketch images are untrusted until this check narrows them.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
  mimeType?: string,
): value is Blob {
  return typeof Blob !== "undefined"
    && value instanceof Blob
    && (mimeType === undefined || value.type === mimeType);
}

function validHttpUrl(
  // Stored sketch fields are untrusted until this check narrows them.
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
  // Stored sketch records are untrusted until this check narrows them.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSketchCaptureMetadata(
  // Capture metadata is read back from storage and parsed here.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
): value is SketchCaptureMetadata {
  if (!isPlainObject(value)) return false;
  // SAFETY: the object check above makes reading optional candidate fields safe.
  const capture = value as CandidateCapture;
  const keys = [
    "url",
    "title",
    "timestamp",
    "viewportWidth",
    "viewportHeight",
    "scrollX",
    "scrollY",
    "devicePixelRatio",
    "host",
    "framework",
    "imageWidth",
    "imageHeight",
  ];
  if (!Object.keys(capture).every((key) => keys.includes(key))) return false;
  return validHttpUrl(capture.url, SKETCH_LIMITS.url)
    && boundedString(capture.title, SKETCH_LIMITS.title, true)
    && safeIntegerInRange(capture.timestamp, 1)
    && safeIntegerInRange(capture.viewportWidth, 1, 100_000)
    && safeIntegerInRange(capture.viewportHeight, 1, 100_000)
    && isFiniteNumber(capture.scrollX)
    && capture.scrollX >= 0
    && isFiniteNumber(capture.scrollY)
    && capture.scrollY >= 0
    && isFiniteNumber(capture.devicePixelRatio)
    && capture.devicePixelRatio > 0
    && capture.devicePixelRatio <= 100
    && boundedString(capture.host, 128)
    && boundedString(capture.framework, 128)
    && safeIntegerInRange(capture.imageWidth, 1, SKETCH_LIMITS.imageEdge)
    && safeIntegerInRange(capture.imageHeight, 1, SKETCH_LIMITS.imageEdge);
}

export function isSketchPoint(
  // Stored points are untrusted until this check narrows them.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
): value is SketchPoint {
  if (!isPlainObject(value)) return false;
  // SAFETY: the object check above makes reading optional candidate fields safe.
  const point = value as CandidatePoint;
  return Object.keys(point).every((key) => key === "x" || key === "y")
    && isFiniteNumber(point.x)
    && isFiniteNumber(point.y)
    && point.x >= 0
    && point.x <= SKETCH_LIMITS.imageEdge
    && point.y >= 0
    && point.y <= SKETCH_LIMITS.imageEdge;
}

export function isSketchAnnotation(
  // Stored annotations are untrusted until this check narrows them.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
): value is SketchAnnotation {
  if (!isPlainObject(value)) return false;
  // SAFETY: the object check above makes reading optional candidate fields safe.
  const annotation = value as CandidateAnnotation;
  return Object.keys(annotation).every((key) => ["id", "number", "point", "description"].includes(key))
    && boundedString(annotation.id, 256)
    && safeIntegerInRange(annotation.number, 1, SKETCH_LIMITS.annotations)
    && isSketchPoint(annotation.point)
    && boundedString(annotation.description, SKETCH_LIMITS.description);
}

export function isSketchStroke(
  // Stored strokes are untrusted until this check narrows them.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
): value is SketchStroke {
  if (!isPlainObject(value)) return false;
  // SAFETY: the object check above makes reading optional candidate fields safe.
  const stroke = value as CandidateStroke;
  return Object.keys(stroke).every((key) => ["id", "kind", "width", "color", "outlineColor", "points"].includes(key))
    && boundedString(stroke.id, 256)
    && (stroke.kind === undefined || stroke.kind === "freehand" || stroke.kind === "rectangle")
    && isFiniteNumber(stroke.width)
    && stroke.width > 0
    && stroke.width <= 128
    && (SKETCH_PEN_COLORS.some((color) => color.value === stroke.color)
      || stroke.color === LEGACY_SKETCH_STROKE_COLOR)
    && (stroke.outlineColor === SKETCH_STROKE_OUTLINE || stroke.outlineColor === LEGACY_SKETCH_STROKE_OUTLINE)
    && Array.isArray(stroke.points)
    && stroke.points.length > 0
    && stroke.points.length <= SKETCH_LIMITS.points
    && stroke.points.every(isSketchPoint);
}

function isSketchStrokeList(
  // Stored stroke lists are untrusted until this check narrows them.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
): value is SketchStroke[] {
  return Array.isArray(value)
    && value.length <= SKETCH_LIMITS.strokes
    && value.every(isSketchStroke);
}

function isSketchAnnotationList(
  // Stored annotation lists are untrusted until this check narrows them.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
): value is SketchAnnotation[] {
  return Array.isArray(value)
    && value.length <= SKETCH_LIMITS.annotations
    && value.every(isSketchAnnotation);
}

export function isSketchDocument(
  // Sketch documents are read back from storage and parsed here.
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
    "revision",
    "createdAt",
    "updatedAt",
    "capture",
    "description",
    "strokes",
    "annotations",
    "imageWidth",
    "imageHeight",
    "originalByteSize",
    "annotatedByteSize",
    "filename",
    "originalImage",
    "annotatedImage",
  ].includes(key))
    && document.schemaVersion === SKETCH_SCHEMA_VERSION
    && boundedString(document.projectId, 256)
    && boundedString(document.id, 256)
    && safeIntegerInRange(document.revision, 1)
    && safeIntegerInRange(document.createdAt, Number.MIN_SAFE_INTEGER)
    && safeIntegerInRange(document.updatedAt, Number.MIN_SAFE_INTEGER)
    && isSketchCaptureMetadata(document.capture)
    && boundedString(document.description, SKETCH_LIMITS.description, true)
    && isSketchStrokeList(document.strokes)
    && document.strokes.reduce((total, stroke) => total + stroke.points.length, 0) <= SKETCH_LIMITS.points
    && (document.annotations === undefined
      || (isSketchAnnotationList(document.annotations)
        && new Set(document.annotations.map((annotation) => annotation.number)).size === document.annotations.length))
    && safeIntegerInRange(document.imageWidth, 1, SKETCH_LIMITS.imageEdge)
    && safeIntegerInRange(document.imageHeight, 1, SKETCH_LIMITS.imageEdge)
    && safeIntegerInRange(document.originalByteSize, 1, SKETCH_LIMITS.imageBytes)
    && safeIntegerInRange(document.annotatedByteSize, 1, SKETCH_LIMITS.imageBytes)
    && boundedString(document.filename, 256)
    && isBlob(document.originalImage, "image/png")
    && isBlob(document.annotatedImage, "image/png")
    && document.originalImage.size === document.originalByteSize
    && document.annotatedImage.size === document.annotatedByteSize;
}

export function isSketchHandoffRecord(
  // Handoff records are read back from storage and parsed here.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
): value is SketchHandoffRecord {
  if (!isPlainObject(value)) return false;
  // SAFETY: the object check above makes reading optional candidate fields safe.
  const handoff = value as CandidateHandoff;
  return Object.keys(handoff).every((key) => [
    "id",
    "projectId",
    "sketchId",
    "sketchRevision",
    "localBatchId",
    "batchRevision",
    "transport",
    "agentRequestId",
    "timestamp",
    "state",
  ].includes(key))
    && boundedString(handoff.id, 256)
    && boundedString(handoff.projectId, 256)
    && boundedString(handoff.sketchId, 256)
    && safeIntegerInRange(handoff.sketchRevision, 1)
    && boundedString(handoff.localBatchId, 256)
    && (handoff.batchRevision === undefined || safeIntegerInRange(handoff.batchRevision, 0))
    && (handoff.transport === "local" || handoff.transport === "clipboard" || handoff.transport === "direct")
    && (handoff.agentRequestId === undefined || boundedString(handoff.agentRequestId, 256))
    && safeIntegerInRange(handoff.timestamp, Number.MIN_SAFE_INTEGER)
    && (handoff.state === "pending"
      || handoff.state === "dispatching"
      || handoff.state === "handing-off"
      || handoff.state === "needs-review"
      || handoff.state === "unknown");
}

export function cloneSketchDocument(document: SketchDocument): SketchDocument {
  return {
    ...document,
    capture: { ...document.capture },
    strokes: document.strokes.map((stroke) => ({
      ...stroke,
      points: stroke.points.map((point) => ({ ...point })),
    })),
    ...(document.annotations
      ? {
          annotations: document.annotations.map((annotation) => ({
            ...annotation,
            point: { ...annotation.point },
          })),
        }
      : {}),
  };
}

export function cloneSketchHandoff(handoff: SketchHandoffRecord): SketchHandoffRecord {
  return { ...handoff };
}

export function sketchContentFingerprint(
  description: string,
  strokes: readonly SketchStroke[],
  annotations: readonly SketchAnnotation[] = [],
): string {
  return JSON.stringify({ description, strokes, annotations });
}

export function sameSketchContent(
  document: Pick<SketchDocument, "description" | "strokes" | "annotations">,
  description: string,
  strokes: readonly SketchStroke[],
  annotations: readonly SketchAnnotation[] = [],
): boolean {
  return sketchContentFingerprint(document.description, document.strokes, document.annotations ?? [])
    === sketchContentFingerprint(description, strokes, annotations);
}

export function toAgentSketchMetadata(document: SketchDocument): AgentSketchMetadata {
  const annotations = document.annotations?.map((annotation) => ({
    number: annotation.number,
    description: annotation.description,
  }));

  return {
    id: document.id,
    revision: document.revision,
    filename: document.filename,
    mimeType: "image/png",
    width: document.imageWidth,
    height: document.imageHeight,
    byteSize: document.annotatedByteSize,
    capture: {
      url: document.capture.url,
      title: document.capture.title,
      timestamp: document.capture.timestamp,
      viewportWidth: document.capture.viewportWidth,
      viewportHeight: document.capture.viewportHeight,
      scrollX: document.capture.scrollX,
      scrollY: document.capture.scrollY,
      devicePixelRatio: document.capture.devicePixelRatio,
      host: document.capture.host,
      framework: document.capture.framework,
    },
    ...(document.description ? { description: document.description } : {}),
    ...(annotations?.length ? { annotations } : {}),
  };
}
