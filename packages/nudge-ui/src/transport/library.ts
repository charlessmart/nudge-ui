/** The user's calls about which components the library lists, saved as `.nudge/library.json`. */
export interface LibraryVisibilityFile {
  readonly version: 1;
  /** Component ids hidden from the library whatever detection said. */
  readonly hidden: readonly string[];
  /** Component ids listed even though detection took them for wrappers. */
  readonly shown: readonly string[];
}

export const EMPTY_LIBRARY_VISIBILITY: LibraryVisibilityFile = { version: 1, hidden: [], shown: [] };

const MAX_IDS = 5000;
const MAX_ID_LENGTH = 512;

function ids(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_IDS) return null;
  if (!value.every((item) => typeof item === "string" && item.length > 0 && item.length <= MAX_ID_LENGTH)) return null;
  return [...new Set(value as string[])].sort();
}

/** A component is hidden or shown, never both: the later call wins, so `shown` loses to `hidden` on conflict. */
export function parseLibraryVisibility(value: unknown): LibraryVisibilityFile | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1) return null;
  const hidden = ids(record.hidden ?? []);
  const shown = ids(record.shown ?? []);
  if (!hidden || !shown) return null;
  const hiddenSet = new Set(hidden);
  return { version: 1, hidden, shown: shown.filter((id) => !hiddenSet.has(id)) };
}

/** Records one call, dropping the opposite one for the same component. */
export function withLibraryVisibility(
  current: LibraryVisibilityFile,
  componentId: string,
  visibility: "hidden" | "shown" | "detected",
): LibraryVisibilityFile {
  const hidden = current.hidden.filter((id) => id !== componentId);
  const shown = current.shown.filter((id) => id !== componentId);
  if (visibility === "hidden") hidden.push(componentId);
  if (visibility === "shown") shown.push(componentId);
  return { version: 1, hidden: hidden.sort(), shown: shown.sort() };
}
