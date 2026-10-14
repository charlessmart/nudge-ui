/** Set in the page's main world before the inspector bundle runs. */
export const BOOT_GLOBAL = "__NUDGE_UI_EXTENSION__";
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

/** Published for one injection into the top frame; the bundle consumes it, so later renderer-frame injections cannot restart the controller. */
export interface ExtensionBoot {
  /** Inspector storage for this origin, keyed without the site prefix. */
  storage: Record<string, string>;
  surface: "editor" | "page";
  unavailableReason?: string;
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

export interface StoredSketchRecords {
  documents: StoredSketchDocument[];
  handoffs: { id: string; [field: string]: unknown }[];
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
