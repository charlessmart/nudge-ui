import { useEffect, useRef } from "react";
import type { KeyboardEvent, PointerEvent, ReactElement, RefObject } from "react";
import {
  MIN_PANEL_WIDTH,
  applyPanelWidth,
  clampPanelWidth,
  panelWidthTarget,
  readStoredPanelWidth,
  storePanelWidth,
} from "./panelWidth.ts";

const KEY_STEP = 16;

/** Which window edge the panel hangs from, so dragging toward the page widens it on either side. */
function panelOnLeft(panel: HTMLElement): boolean {
  const rect = panel.getBoundingClientRect();
  return rect.left + rect.width / 2 < panel.ownerDocument.defaultView!.innerWidth / 2;
}

/** A strip on the panel's page-facing edge; drag it to set the panel's width, double-click to reset. */
export function PanelResizeHandle({ panelRef }: { readonly panelRef: RefObject<HTMLElement | null> }): ReactElement {
  const drag = useRef<{ startX: number; startWidth: number; onLeft: boolean } | null>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const stored = readStoredPanelWidth(panel.ownerDocument.defaultView!.innerWidth);
    if (stored !== null) applyPanelWidth(panelWidthTarget(panel), stored);
  }, [panelRef]);

  function resizeTo(panel: HTMLElement, width: number): number {
    const next = clampPanelWidth(width, panel.ownerDocument.defaultView!.innerWidth);
    applyPanelWidth(panelWidthTarget(panel), next);
    return next;
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>): void {
    const panel = panelRef.current;
    if (!panel || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: panel.getBoundingClientRect().width, onLeft: panelOnLeft(panel) };
    event.currentTarget.setAttribute("data-resizing", "true");
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>): void {
    const panel = panelRef.current;
    const start = drag.current;
    if (!panel || !start) return;
    const delta = event.clientX - start.startX;
    resizeTo(panel, start.startWidth + (start.onLeft ? delta : -delta));
  }

  function endDrag(event: PointerEvent<HTMLDivElement>): void {
    const panel = panelRef.current;
    if (!drag.current) return;
    drag.current = null;
    event.currentTarget.removeAttribute("data-resizing");
    if (panel) storePanelWidth(Math.round(panel.getBoundingClientRect().width));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const panel = panelRef.current;
    if (!panel || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    event.stopPropagation();
    // Arrow toward the page to widen, away from it to narrow.
    const towardPage = (event.key === "ArrowRight") === panelOnLeft(panel);
    const width = resizeTo(panel, panel.getBoundingClientRect().width + (towardPage ? KEY_STEP : -KEY_STEP));
    storePanelWidth(width);
  }

  function handleDoubleClick(): void {
    const panel = panelRef.current;
    if (!panel) return;
    applyPanelWidth(panelWidthTarget(panel), null);
    storePanelWidth(null);
  }

  return (
    <div
      className="panel__resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize inspector"
      aria-valuemin={MIN_PANEL_WIDTH}
      tabIndex={0}
      data-test="panel-resize"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onKeyDown={handleKeyDown}
      onDoubleClick={handleDoubleClick}
    />
  );
}
