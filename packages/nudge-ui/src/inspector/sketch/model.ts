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
export const SKETCH_STROKE_COLOR = "#0096ff";
export const SKETCH_STROKE_OUTLINE = "";
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

type SketchStrokeColor = typeof SKETCH_STROKE_COLOR | typeof LEGACY_SKETCH_STROKE_COLOR;
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

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function boundedString(value: unknown, maximum: number, allowEmpty = false): value is string {
  return typeof value === "string" && value.length <= maximum && (allowEmpty || value.length > 0);
}

function isBlob(value: unknown, mimeType?: string): value is Blob {
  return typeof Blob !== "undefined"
    && value instanceof Blob
    && (mimeType === undefined || value.type === mimeType);
}

function validHttpUrl(value: unknown, maximum: number): value is string {
  if (!boundedString(value, maximum)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isSketchCaptureMetadata(value: unknown): value is SketchCaptureMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const capture = value as Record<string, unknown>;
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
    && Number.isSafeInteger(capture.timestamp)
    && (capture.timestamp as number) > 0
    && Number.isSafeInteger(capture.viewportWidth)
    && (capture.viewportWidth as number) > 0
    && (capture.viewportWidth as number) <= 100_000
    && Number.isSafeInteger(capture.viewportHeight)
    && (capture.viewportHeight as number) > 0
    && (capture.viewportHeight as number) <= 100_000
    && isFiniteNumber(capture.scrollX)
    && capture.scrollX >= 0
    && isFiniteNumber(capture.scrollY)
    && capture.scrollY >= 0
    && isFiniteNumber(capture.devicePixelRatio)
    && capture.devicePixelRatio > 0
    && capture.devicePixelRatio <= 100
    && boundedString(capture.host, 128)
    && boundedString(capture.framework, 128)
    && Number.isSafeInteger(capture.imageWidth)
    && (capture.imageWidth as number) > 0
    && (capture.imageWidth as number) <= SKETCH_LIMITS.imageEdge
    && Number.isSafeInteger(capture.imageHeight)
    && (capture.imageHeight as number) > 0
    && (capture.imageHeight as number) <= SKETCH_LIMITS.imageEdge;
}

export function isSketchPoint(value: unknown): value is SketchPoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const point = value as Record<string, unknown>;
  return Object.keys(point).every((key) => key === "x" || key === "y")
    && isFiniteNumber(point.x)
    && isFiniteNumber(point.y)
    && point.x >= 0
    && point.x <= SKETCH_LIMITS.imageEdge
    && point.y >= 0
    && point.y <= SKETCH_LIMITS.imageEdge;
}

export function isSketchAnnotation(value: unknown): value is SketchAnnotation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const annotation = value as Record<string, unknown>;
  return Object.keys(annotation).every((key) => ["id", "number", "point", "description"].includes(key))
    && boundedString(annotation.id, 256)
    && Number.isSafeInteger(annotation.number)
    && (annotation.number as number) >= 1
    && (annotation.number as number) <= SKETCH_LIMITS.annotations
    && isSketchPoint(annotation.point)
    && boundedString(annotation.description, SKETCH_LIMITS.description);
}

export function isSketchStroke(value: unknown): value is SketchStroke {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const stroke = value as Record<string, unknown>;
  return Object.keys(stroke).every((key) => ["id", "kind", "width", "color", "outlineColor", "points"].includes(key))
    && boundedString(stroke.id, 256)
    && (stroke.kind === undefined || stroke.kind === "freehand" || stroke.kind === "rectangle")
    && isFiniteNumber(stroke.width)
    && stroke.width > 0
    && stroke.width <= 128
    && (stroke.color === SKETCH_STROKE_COLOR || stroke.color === LEGACY_SKETCH_STROKE_COLOR)
    && (stroke.outlineColor === SKETCH_STROKE_OUTLINE || stroke.outlineColor === LEGACY_SKETCH_STROKE_OUTLINE)
    && Array.isArray(stroke.points)
    && stroke.points.length > 0
    && stroke.points.length <= SKETCH_LIMITS.points
    && stroke.points.every(isSketchPoint);
}

export function isSketchDocument(value: unknown): value is SketchDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const document = value as Record<string, unknown>;
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
    && Number.isSafeInteger(document.revision)
    && (document.revision as number) > 0
    && Number.isSafeInteger(document.createdAt)
    && Number.isSafeInteger(document.updatedAt)
    && isSketchCaptureMetadata(document.capture)
    && boundedString(document.description, SKETCH_LIMITS.description, true)
    && Array.isArray(document.strokes)
    && document.strokes.length <= SKETCH_LIMITS.strokes
    && document.strokes.every(isSketchStroke)
    && document.strokes.reduce((total, stroke) => total + (stroke as SketchStroke).points.length, 0) <= SKETCH_LIMITS.points
    && (document.annotations === undefined
      || (Array.isArray(document.annotations)
        && document.annotations.length <= SKETCH_LIMITS.annotations
        && document.annotations.every(isSketchAnnotation)
        && new Set(document.annotations.map((annotation) => annotation.number)).size === document.annotations.length))
    && document.imageWidth === document.capture.imageWidth
    && document.imageHeight === document.capture.imageHeight
    && Number.isSafeInteger(document.originalByteSize)
    && (document.originalByteSize as number) > 0
    && (document.originalByteSize as number) <= SKETCH_LIMITS.imageBytes
    && Number.isSafeInteger(document.annotatedByteSize)
    && (document.annotatedByteSize as number) > 0
    && (document.annotatedByteSize as number) <= SKETCH_LIMITS.imageBytes
    && boundedString(document.filename, 256)
    && isBlob(document.originalImage, "image/png")
    && isBlob(document.annotatedImage, "image/png")
    && document.originalImage.size === (document.originalByteSize as number)
    && document.annotatedImage.size === (document.annotatedByteSize as number);
}

export function isSketchHandoffRecord(value: unknown): value is SketchHandoffRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const handoff = value as Record<string, unknown>;
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
    && Number.isSafeInteger(handoff.sketchRevision)
    && (handoff.sketchRevision as number) > 0
    && boundedString(handoff.localBatchId, 256)
    && (handoff.batchRevision === undefined
      || (Number.isSafeInteger(handoff.batchRevision) && (handoff.batchRevision as number) >= 0))
    && (handoff.transport === "local" || handoff.transport === "clipboard" || handoff.transport === "direct")
    && (handoff.agentRequestId === undefined || boundedString(handoff.agentRequestId, 256))
    && Number.isSafeInteger(handoff.timestamp)
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
