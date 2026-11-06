import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY_LIBRARY_VISIBILITY,
  parseLibraryVisibility,
  withLibraryVisibility,
  type LibraryVisibilityFile,
} from "../../transport/library.ts";
import { NUDGE_UI_LIBRARY_PATH } from "../../transport/routes.ts";

export async function readLibraryVisibility(): Promise<LibraryVisibilityFile> {
  const response = await fetch(NUDGE_UI_LIBRARY_PATH, { cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Library settings could not be read.");
  const parsed = parseLibraryVisibility(await response.json());
  if (!parsed) throw new Error("Library settings were invalid.");
  return parsed;
}

export async function writeLibraryVisibility(value: LibraryVisibilityFile): Promise<void> {
  const response = await fetch(NUDGE_UI_LIBRARY_PATH, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Library settings could not be saved.");
}

export interface LibraryVisibilityState {
  readonly file: LibraryVisibilityFile;
  readonly error: string | null;
  /** Applies at once and saves to the project; a failed save puts the previous call back. */
  readonly setVisibility: (componentId: string, visibility: "hidden" | "shown" | "detected") => void;
}

/** The project's hide and show calls, which outrank detection. Reads once; edits are optimistic. */
export function useLibraryVisibility(): LibraryVisibilityState {
  const [file, setFile] = useState<LibraryVisibilityFile>(EMPTY_LIBRARY_VISIBILITY);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(file);
  // Saves run one after another so a slow earlier write cannot land over a later one.
  const queue = useRef<Promise<void>>(Promise.resolve());

  const apply = useCallback((next: LibraryVisibilityFile) => {
    latest.current = next;
    setFile(next);
  }, []);

  useEffect(() => {
    let current = true;
    readLibraryVisibility().then((value) => { if (current) apply(value); }).catch(() => {
      // Without the route (another host, or sheets off) the library simply keeps detection's calls.
    });
    return () => { current = false; };
  }, [apply]);

  const setVisibility = useCallback((componentId: string, visibility: "hidden" | "shown" | "detected") => {
    const previous = latest.current;
    const next = withLibraryVisibility(previous, componentId, visibility);
    apply(next);
    setError(null);
    queue.current = queue.current
      .then(() => writeLibraryVisibility(next))
      .catch((failure: unknown) => {
        if (latest.current === next) apply(previous);
        setError(failure instanceof Error ? failure.message : "Library settings could not be saved.");
      });
  }, [apply]);

  return { file, error, setVisibility };
}
