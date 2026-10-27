import { useCallback, useEffect, useLayoutEffect, useReducer } from "react";
import type { RefObject } from "react";
import { getSketchScrollPosition, sketchHostWindow } from "./viewport.ts";

/**
 * Keeps `group` (marks in page coordinates) translated by the frame's scroll. The transform is written straight to the
 * DOM in the scroll listener rather than through React state, so marks move in the same frame as the page. Returns a
 * function that applies it at once, for a caller that has just scrolled the frame itself.
 */
export function useScrollTransform(host: HTMLElement | null, group: RefObject<SVGGElement | null>): () => void {
  // A navigated frame has a new window, so the listener moves to it.
  const [load, reload] = useReducer((count: number) => count + 1, 0);

  const apply = useCallback(() => {
    const element = group.current;
    const win = host ? sketchHostWindow(host) : null;
    if (!element || !win) return;
    const { x, y } = getSketchScrollPosition(win);
    element.setAttribute("transform", `translate(${-x} ${-y})`);
  }, [group, host]);

  // Every render may mount a new group; it starts at the current scroll, not at the top.
  useLayoutEffect(apply);

  useEffect(() => {
    if (!host) return;
    host.addEventListener("load", reload);
    return () => host.removeEventListener("load", reload);
  }, [host]);

  useEffect(() => {
    const win = host ? sketchHostWindow(host) : null;
    if (!win) return;
    apply();
    win.addEventListener("scroll", apply, { capture: true, passive: true });
    win.addEventListener("resize", apply, { passive: true });
    return () => {
      win.removeEventListener("scroll", apply, { capture: true });
      win.removeEventListener("resize", apply);
    };
  }, [apply, host, load]);

  return apply;
}
