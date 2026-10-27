import { useEffect, useReducer } from "react";
import { canvasFrameHost } from "../canvasFrame.ts";
import { getRegisteredFrames } from "../projection.ts";
import { sketchMarksKey } from "./marksStore.ts";

interface NavigationEvents {
  addEventListener(type: "currententrychange", listener: () => void): void;
  removeEventListener(type: "currententrychange", listener: () => void): void;
}

/** The card a sketch host renders: a card's iframe, or the page root on the page surface. */
export function sketchCardId(host: HTMLElement): string | null {
  for (const [cardId, frame] of getRegisteredFrames()) {
    if (canvasFrameHost(frame) === host) return cardId;
  }
  return null;
}

function hostWindow(host: HTMLElement): Window | null {
  if (typeof HTMLIFrameElement !== "undefined" && host instanceof HTMLIFrameElement) return host.contentWindow;
  return host.ownerDocument.defaultView;
}

/** The page a frame shows, without its hash: scrolling to an anchor stays on the same page. */
export function sketchFrameUrl(host: HTMLElement): string {
  try {
    const location = hostWindow(host)?.location;
    if (location) return `${location.origin}${location.pathname}${location.search}`;
  } catch {
    // A cross-origin frame hides its location; its source is the next best name for the page.
  }
  return host.getAttribute("src") ?? "";
}

/** Re-renders when the frame moves to another page, by navigation or by the app's own routing. */
function useFrameNavigation(host: HTMLElement | null): void {
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const [load, reload] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    if (!host) return;
    host.addEventListener("load", reload);
    return () => host.removeEventListener("load", reload);
  }, [host]);

  useEffect(() => {
    const win = host ? hostWindow(host) : null;
    if (!win) return;
    // SAFETY: the Navigation API is newer than TypeScript's DOM types; it is optional and checked before use.
    const navigation = (win as Window & { navigation?: NavigationEvents }).navigation;
    try {
      win.addEventListener("popstate", rerender);
      win.addEventListener("hashchange", rerender);
      navigation?.addEventListener("currententrychange", rerender);
    } catch {
      return;
    }
    rerender();
    return () => {
      win.removeEventListener("popstate", rerender);
      win.removeEventListener("hashchange", rerender);
      navigation?.removeEventListener("currententrychange", rerender);
    };
  }, [host, load]);
}

/** The marks key for whatever page `host` shows now, or `null` when it is not a registered frame. */
export function useSketchMarksKey(host: HTMLElement | null, cardId = host ? sketchCardId(host) : null): string | null {
  useFrameNavigation(host);
  if (!host || !cardId) return null;
  return sketchMarksKey(cardId, sketchFrameUrl(host));
}
