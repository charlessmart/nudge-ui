/** Set in the page's main world before the inspector bundle runs. */
export const BOOT_GLOBAL = "__NUDGE_UI_EXTENSION__";
export const PAGE_INSPECTOR_GLOBAL = "__NUDGE_UI_PAGE_INSPECTOR__";
/** Read by nudge-ui when its bundle evaluates; see `customCursors.ts`. */
export const CURSOR_IMAGE_BASE_GLOBAL = "__NUDGE_UI_CURSOR_IMAGE_BASE__";
export const CURSOR_IMAGE_DIRECTORY = "cursors/";
/** Dispatched on `document` by the main world; the isolated-world bridge persists it. */
export const STORAGE_WRITE_EVENT = "nudge-ui:storage-write";

export interface ExtensionBoot {
  /** Inspector storage for this origin, keyed without the site prefix. */
  storage: Record<string, string>;
}

export interface StorageWrite {
  key: string;
  value: string | null;
}

/** Scopes every stored key to the page origin that wrote it. */
export function siteKeyPrefix(origin: string): string {
  return `site:${origin}|`;
}
