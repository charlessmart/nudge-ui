import { createNudgeUiEditorUrl } from "../../transport/editor.ts";

/**
 * Mirrors the active frame's page into the address bar. History entries can only name this document's own origin, and
 * a saved iteration remembers the origin it was captured on, so a different dev port or host is skipped, not thrown.
 */
export function mirrorEditorAddress(sourceUrl: string): void {
  let editorUrl: string;
  try {
    if (new URL(sourceUrl).origin !== window.location.origin) return;
    editorUrl = createNudgeUiEditorUrl(sourceUrl);
  } catch {
    return;
  }
  if (window.location.href !== editorUrl) window.history.replaceState(window.history.state, "", editorUrl);
}
