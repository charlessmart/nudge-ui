import { inspectorStorage } from "../runtime/inspectorStorage.ts";

const STORAGE_KEY = "panel-width";
export const MIN_PANEL_WIDTH = 280;
const MAX_PANEL_WIDTH = 720;
/** Leaves this much of the window for the page, however wide the panel is dragged. */
const MIN_PAGE_SHARE = 0.35;

export function clampPanelWidth(width: number, viewportWidth: number): number {
  const max = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, viewportWidth * (1 - MIN_PAGE_SHARE)));
  return Math.round(Math.min(max, Math.max(MIN_PANEL_WIDTH, width)));
}

/** Where `--panel-width` is set: the shadow host, whose `:host` rule supplies the default, else the document root. */
export function panelWidthTarget(from: Node): HTMLElement {
  const root = from.getRootNode();
  return root instanceof ShadowRoot ? root.host as HTMLElement : from.ownerDocument!.documentElement;
}

export function applyPanelWidth(target: HTMLElement, width: number | null): void {
  if (width === null) target.style.removeProperty("--panel-width");
  else target.style.setProperty("--panel-width", `${width}px`);
}

export function readStoredPanelWidth(viewportWidth: number): number | null {
  try {
    const width = Number(inspectorStorage()?.getItem(STORAGE_KEY));
    return Number.isFinite(width) && width > 0 ? clampPanelWidth(width, viewportWidth) : null;
  } catch {
    return null;
  }
}

export function storePanelWidth(width: number | null): void {
  try {
    if (width === null) inspectorStorage()?.removeItem(STORAGE_KEY);
    else inspectorStorage()?.setItem(STORAGE_KEY, String(width));
  } catch {
    // A page without storage keeps the width for this load only.
  }
}
