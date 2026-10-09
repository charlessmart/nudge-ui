/** Set in the page's main world before the inspector bundle runs. */
export const BOOT_GLOBAL = "__NUDGE_UI_EXTENSION__";
export const PAGE_INSPECTOR_GLOBAL = "__NUDGE_UI_PAGE_INSPECTOR__";
/** Read by nudge-ui when its bundle evaluates; see `customCursors.ts`. */
export const CURSOR_IMAGE_BASE_GLOBAL = "__NUDGE_UI_CURSOR_IMAGE_BASE__";
export const CURSOR_IMAGE_DIRECTORY = "cursors/";
/** Dispatched on `document` by the main world; the isolated-world bridge persists it. */
export const STORAGE_WRITE_EVENT = "nudge-ui:storage-write";
/** Dispatched on `document` by the editor when a renderer frame loads a document. */
export const RENDERER_FRAME_LOAD_EVENT = "nudge-ui:renderer-frame-load";
/** Sent from the isolated-world bridge to the service worker. */
export const INJECT_RENDERERS_MESSAGE = "nudge-ui:inject-renderers";

/**
 * Published for one injection into the top frame; the bundle consumes it, so
 * later injections into renderer frames cannot restart the controller.
 */
export interface ExtensionBoot {
  /** Inspector storage for this origin, keyed without the site prefix. */
  storage: Record<string, string>;
  surface: "editor" | "page";
}

export interface StorageWrite {
  key: string;
  value: string | null;
}

/** Scopes every stored key to the page origin that wrote it. */
export function siteKeyPrefix(origin: string): string {
  return `site:${origin}|`;
}

const EDITOR_QUERY = "nudge-ui=editor";

/** Adds the editor marker without re-encoding the application's own query. */
export function editorUrl(applicationHref: string): string {
  const url = new URL(applicationHref);
  url.search = url.search ? `${url.search}&${EDITOR_QUERY}` : `?${EDITOR_QUERY}`;
  return url.href;
}

export function isEditorUrl(href: string): boolean {
  return new URL(href).searchParams.getAll("nudge-ui").includes("editor");
}
