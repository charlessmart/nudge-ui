import { useEffect, useState } from "react";
import { getSketchViewport, type SketchViewport } from "./capture.ts";

/** Tracks the captured frame's placement and scroll; a card or panel resize re-measures it too. */
export function useSketchViewport(
  hostElement: HTMLElement,
  open: boolean,
  layoutKey?: string,
): { readonly viewport: SketchViewport; readonly setViewport: (viewport: SketchViewport) => void } {
  const [viewport, setViewport] = useState<SketchViewport>(() => getSketchViewport(hostElement));

  useEffect(() => {
    if (!open) return;
    const update = (): void => setViewport(getSketchViewport(hostElement));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const frameWindow = typeof HTMLIFrameElement !== "undefined" && hostElement instanceof HTMLIFrameElement
      ? hostElement.contentWindow
      : null;
    frameWindow?.addEventListener("resize", update);
    frameWindow?.addEventListener("scroll", update, true);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(hostElement);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      frameWindow?.removeEventListener("resize", update);
      frameWindow?.removeEventListener("scroll", update, true);
      observer?.disconnect();
    };
  }, [hostElement, open]);

  // Panning or zooming the board moves the frame without resizing it, so no listener above sees it.
  useEffect(() => {
    if (open) setViewport(getSketchViewport(hostElement));
  }, [hostElement, layoutKey, open]);

  return { viewport, setViewport };
}
