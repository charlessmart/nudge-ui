import { isNudgeUiDirectUrl, openNudgeUi, readNudgeUiEditorTarget } from "../transport/editor.ts";
import { isCanvasRenderer } from "./canvas/roleDetection.ts";

const OPEN_PANEL_SESSION_KEY = "nudge-ui:demo-open-panel";

function isEditorDocument(): boolean {
  const href = window.location.href;
  return !isNudgeUiDirectUrl(href) && readNudgeUiEditorTarget(href) !== null;
}

/**
 * The demo's open action, run on the plain page's `nudge-ui:open`. The plain page owns the top document so crawlers
 * index it (ADR-0049); the editor loads only from an explicit editor URL. The editor and its Canvas frames already
 * have their own open paths, so they ignore the event here.
 */
export function openDemoEditor(navigate: () => void = openNudgeUi): void {
  if (isCanvasRenderer() || isEditorDocument()) return;
  try {
    sessionStorage.setItem(OPEN_PANEL_SESSION_KEY, "1");
  } catch {
    // The editor still opens, collapsed.
  }
  navigate();
}

/** One-shot: the editor opens expanded after an open action and collapsed after a refresh. */
export function consumeDemoOpenPanelIntent(): boolean {
  try {
    const requested = sessionStorage.getItem(OPEN_PANEL_SESSION_KEY) === "1";
    sessionStorage.removeItem(OPEN_PANEL_SESSION_KEY);
    return requested;
  } catch {
    return false;
  }
}

/** The editor document is a tool, not content, so it stays out of search results. */
export function markDocumentNoindex(): void {
  if (document.querySelector('meta[name="robots"]')) return;
  const meta = document.createElement("meta");
  meta.name = "robots";
  meta.content = "noindex";
  document.head.append(meta);
}
