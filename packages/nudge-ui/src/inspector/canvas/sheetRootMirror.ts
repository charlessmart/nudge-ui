import type { CanvasFrame } from "./canvasFrame.ts";
import { getRegisteredFrames, subscribeFrameRegistry } from "./projection.ts";

const SHEET_ROOT = "[data-nudge-ui-component-sheet]";
const MIRRORED = "data-nudge-ui-mirrored";

/**
 * Themes usually live on the application's `<html>` and `<body>` (`.dark`, `data-theme`, a design system's colour
 * scheme class), which a component sheet never runs the application code to set. Sheets copy those attributes from
 * a live application frame and follow them as the application changes theme.
 */
export function mirrorAppRootIntoSheets(): () => void {
  let observer: MutationObserver | null = null;
  const loadListeners = new Map<CanvasFrame, () => void>();

  const isSheet = (doc: Document): boolean => doc.querySelector(SHEET_ROOT) !== null
    || doc.location.pathname.startsWith("/__nudge_ui__/components");

  function sync(): void {
    const frames = [...getRegisteredFrames().values()];
    for (const frame of frames) {
      if (loadListeners.has(frame) || !(frame instanceof EventTarget)) continue;
      // A reloaded sheet (HMR or contract change) starts without the copied attributes.
      const listener = (): void => sync();
      frame.addEventListener("load", listener);
      loadListeners.set(frame, listener);
    }
    const documents = frames.flatMap((frame) => frame.contentDocument ? [frame.contentDocument] : []);
    const source = documents.find((doc) => !isSheet(doc) && doc.documentElement);
    observer?.disconnect();
    observer = null;
    if (!source) return;
    for (const sheet of documents.filter(isSheet)) {
      copyRootAttributes(source.documentElement, sheet.documentElement);
      if (source.body && sheet.body) copyRootAttributes(source.body, sheet.body);
    }
    observer = new MutationObserver(() => sync());
    observer.observe(source.documentElement, { attributes: true });
    if (source.body) observer.observe(source.body, { attributes: true });
  }

  sync();
  const unsubscribe = subscribeFrameRegistry(sync);
  return () => {
    unsubscribe();
    observer?.disconnect();
    for (const [frame, listener] of loadListeners) {
      if (frame instanceof EventTarget) frame.removeEventListener("load", listener);
    }
  };
}

/** Copies application-owned attributes; Nudge's own markers and inline styles stay with each document. */
export function copyRootAttributes(from: Element, to: Element): void {
  const previous = new Set((to.getAttribute(MIRRORED) ?? "").split(" ").filter(Boolean));
  const copied: string[] = [];
  for (const { name, value } of from.attributes) {
    if (name === "style" || name.startsWith("data-nudge-ui")) continue;
    if (to.getAttribute(name) !== value) to.setAttribute(name, value);
    copied.push(name);
    previous.delete(name);
  }
  // An attribute the application removed (switching back to light) must leave the sheet too.
  for (const name of previous) to.removeAttribute(name);
  to.setAttribute(MIRRORED, copied.join(" "));
}
