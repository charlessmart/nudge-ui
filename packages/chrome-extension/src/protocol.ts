/** Set in the page's main world before the inspector bundle runs. */
export const BOOT_GLOBAL = "__NUDGE_UI_EXTENSION__";
/** Set on the editor document's root once the editor has replaced the page markup. */
export const EDITOR_READY_ATTRIBUTE = "data-nudge-ui-editor";
export const PAGE_INSPECTOR_GLOBAL = "__NUDGE_UI_PAGE_INSPECTOR__";
/** Read by nudge-ui when its bundle evaluates; see `customCursors.ts`. */
export const CURSOR_IMAGE_BASE_GLOBAL = "__NUDGE_UI_CURSOR_IMAGE_BASE__";
export const CURSOR_IMAGE_DIRECTORY = "cursors/";
/** Dispatched on `document` by the main world; the isolated-world bridge persists it. */
export const STORAGE_WRITE_EVENT = "nudge-ui:storage-write";
export const STORAGE_READ_EVENT = "nudge-ui:storage-read";
export const STORAGE_READ_RESPONSE_EVENT = "nudge-ui:storage-read-response";
/** Dispatched on `document` by the editor when a renderer frame loads a document. */
export const RENDERER_FRAME_LOAD_EVENT = "nudge-ui:renderer-frame-load";
/** Sent from the isolated-world bridge to the service worker. */
export const INJECT_RENDERERS_MESSAGE = "nudge-ui:inject-renderers";
/** Dispatched on `document` by the main world; the isolated-world bridge answers each with a response. */
export const SKETCH_REQUEST_EVENT = "nudge-ui:sketch-request";
export const SKETCH_RESPONSE_EVENT = "nudge-ui:sketch-response";
/** Dispatched on `document` by the main world with a request ID; the isolated-world bridge answers with the installed font families. */
export const FONT_LIST_REQUEST_EVENT = "nudge-ui:font-list-request";
export const FONT_LIST_RESPONSE_EVENT = "nudge-ui:font-list-response";
/** Sent from the isolated-world bridge to the service worker, the only context that can call `chrome.fontSettings`. */
export const FONT_LIST_MESSAGE = "nudge-ui:font-list";

/** Published for one injection into the top frame; the bundle consumes it, so later renderer-frame injections cannot restart the controller. */
export interface ExtensionBoot {
  /** Inspector storage for this origin, keyed without the site prefix. */
  storage: Record<string, string>;
  surface: "editor" | "page";
  unavailableReason?: string;
  /** Whether the user has asked for the system font list on this origin. */
  systemFontsAllowed?: boolean;
}

export interface StorageWrite {
  key: string;
  value: string | null;
}

export interface StorageReadResponse {
  id: number;
  values?: Record<string, string>;
  error?: string;
}

/** Scopes every stored key to the page origin that wrote it. */
export function siteKeyPrefix(origin: string): string {
  return `site:${origin}|`;
}

/**
 * Consent for the font list lives apart from `site:` keys, which the page can
 * write through the bridge; only the service worker writes this one.
 */
export function systemFontsKey(origin: string): string {
  return `system-fonts:${origin}`;
}

/**
 * Sketches carry screenshots, so they live apart from the `site:` keys the
 * service worker reads in full before every injection.
 */
export function sketchKeyPrefix(origin: string): string {
  return `sketch:${origin}|`;
}

/** A sketch PNG; `chrome.storage` holds only JSON values. */
export interface StoredImage {
  type: string;
  base64: string;
}

/** A sketch document with its images encoded; other fields pass through unchanged. */
export interface StoredSketchDocument {
  id: string;
  originalImage: StoredImage;
  annotatedImage: StoredImage;
  [field: string]: unknown;
}

export interface StoredSketchHandoff {
  id: string;
  [field: string]: unknown;
}

export interface StoredSketchRecords {
  documents: StoredSketchDocument[];
  handoffs: StoredSketchHandoff[];
}

export type SketchRequest =
  | { id: number; op: "read" }
  | {
    id: number;
    op: "update";
    put: StoredSketchRecords;
    deleteDocumentIds: string[];
    deleteHandoffIds: string[];
  };

export type SketchResponse =
  | { id: number; ok: true; records?: StoredSketchRecords }
  | { id: number; ok: false; error: string };

/**
 * `asked` is true when the bridge saw a trusted click or Enter on the "Show
 * system fonts" row, which records the user's consent for the sender's origin.
 */
export interface FontListMessage {
  type: typeof FONT_LIST_MESSAGE;
  asked: boolean;
}

/** The service worker's reply to `FONT_LIST_MESSAGE`. */
export type FontListResult = { families: string[] } | { error: string };

export interface FontListResponse {
  id: number;
  families?: string[];
  error?: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

export function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "number");
}

function isStoredImage(value: unknown): value is StoredImage {
  return isRecord(value) && typeof value.type === "string" && typeof value.base64 === "string";
}

/** Event details cross the page boundary as JSON strings. */
function parseJsonRecord(detail: unknown): Record<string, unknown> | null {
  if (typeof detail !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(detail);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Parses one record at rest; anything else is dropped before it reaches the inspector. */
export function parseStoredSketchDocument(value: unknown): StoredSketchDocument | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const { originalImage, annotatedImage } = value;
  if (!isStoredImage(originalImage) || !isStoredImage(annotatedImage)) return null;
  return { ...value, id: value.id, originalImage, annotatedImage };
}

/** Parses one handoff at rest; the sketch store validates the full record later. */
export function parseStoredSketchHandoff(value: unknown): StoredSketchHandoff | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return { ...value, id: value.id };
}

export function parseStoredSketchRecords(value: unknown): StoredSketchRecords | null {
  if (!isRecord(value) || !Array.isArray(value.documents) || !Array.isArray(value.handoffs)) return null;
  const documents = value.documents.map(parseStoredSketchDocument).filter((document) => document !== null);
  const handoffs = value.handoffs.map(parseStoredSketchHandoff).filter((handoff) => handoff !== null);
  const complete = documents.length === value.documents.length && handoffs.length === value.handoffs.length;
  return complete ? { documents, handoffs } : null;
}

export function parseStorageWrite(detail: unknown): StorageWrite | null {
  const parsed = parseJsonRecord(detail);
  if (!parsed || typeof parsed.key !== "string") return null;
  const { value } = parsed;
  if (value !== null && typeof value !== "string") return null;
  return { key: parsed.key, value };
}

export function parseStorageReadResponse(detail: unknown): StorageReadResponse | null {
  const parsed = parseJsonRecord(detail);
  if (!parsed || typeof parsed.id !== "number") return null;
  const { values, error } = parsed;
  if (values !== undefined && !isStringRecord(values)) return null;
  if (error !== undefined && typeof error !== "string") return null;
  return { id: parsed.id, ...(values === undefined ? {} : { values }), ...(error === undefined ? {} : { error }) };
}

export function parseFontListMessage(value: unknown): FontListMessage | null {
  if (!isRecord(value) || value.type !== FONT_LIST_MESSAGE || typeof value.asked !== "boolean") return null;
  return { type: FONT_LIST_MESSAGE, asked: value.asked };
}

export function parseFontListResult(value: unknown): FontListResult | null {
  if (!isRecord(value)) return null;
  if (isStringArray(value.families)) return { families: value.families };
  return typeof value.error === "string" ? { error: value.error } : null;
}

export function parseFontListResponse(detail: unknown): FontListResponse | null {
  const parsed = parseJsonRecord(detail);
  if (!parsed || typeof parsed.id !== "number") return null;
  const { families, error } = parsed;
  if (families !== undefined && !isStringArray(families)) return null;
  if (error !== undefined && typeof error !== "string") return null;
  return { id: parsed.id, ...(families === undefined ? {} : { families }), ...(error === undefined ? {} : { error }) };
}

export function parseSketchRequest(detail: unknown): SketchRequest | null {
  const parsed = parseJsonRecord(detail);
  if (!parsed || typeof parsed.id !== "number" || !Number.isSafeInteger(parsed.id)) return null;
  if (parsed.op === "read") return { id: parsed.id, op: "read" };
  if (parsed.op !== "update") return null;
  const put = parseStoredSketchRecords(parsed.put);
  if (!put || !isStringArray(parsed.deleteDocumentIds) || !isStringArray(parsed.deleteHandoffIds)) return null;
  return { id: parsed.id, op: "update", put, deleteDocumentIds: parsed.deleteDocumentIds, deleteHandoffIds: parsed.deleteHandoffIds };
}

export function parseSketchResponse(detail: unknown): SketchResponse | null {
  const parsed = parseJsonRecord(detail);
  if (!parsed || typeof parsed.id !== "number") return null;
  if (parsed.ok === true) {
    if (parsed.records === undefined) return { id: parsed.id, ok: true };
    const records = parseStoredSketchRecords(parsed.records);
    return records === null ? null : { id: parsed.id, ok: true, records };
  }
  return parsed.ok === false && typeof parsed.error === "string"
    ? { id: parsed.id, ok: false, error: parsed.error }
    : null;
}

const EDITOR_QUERY = "nudge-ui=editor";

/** Adds the editor marker without re-encoding the application's own query. */
export function editorUrl(applicationHref: string): string {
  const url = new URL(applicationHref);
  if (isEditorUrl(url.href)) return url.href;
  url.search = url.search ? `${url.search}&${EDITOR_QUERY}` : `?${EDITOR_QUERY}`;
  return url.href;
}

/** Removes editor markers while preserving the application's query encoding. */
export function applicationUrl(href: string): string {
  const url = new URL(href);
  url.search = url.search.slice(1).split("&").filter((segment) => (
    new URLSearchParams(segment).get("nudge-ui") !== "editor"
  )).join("&");
  return url.href;
}

export function isEditorUrl(href: string): boolean {
  return new URL(href).searchParams.getAll("nudge-ui").includes("editor");
}
