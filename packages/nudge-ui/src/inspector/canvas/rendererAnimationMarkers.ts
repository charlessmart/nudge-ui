import { NUDGE_UI_MOUNT_ID } from "../../transport/routes.ts";
import { invalidatePageScan, scanPageAnimations, trackPageScanChanges, type AnimationGroup } from "./animationScan.ts";

const CONTAINER_ID = "nudge-ui-animation-markers";
const MARKER_ATTRIBUTE = "data-nudge-ui-animation-marker";
const MARKER_LIMIT = 150;
const RESCAN_DELAY_MS = 400;
// Blue matches the DOM navigator chip in InspectorOverlay.css; the page has no access to the inspector's CSS variables. The marker shares the chip's bottom-center slot and gap, so selecting the element lets the navigator cover it.
const MARKER_SIZE = 24;
const MARKER_GAP = 8;
const MARKER_INSET = 4;
const MARKER_STYLE = [
  "position:absolute",
  "z-index:2147483645",
  "box-sizing:border-box",
  `width:${MARKER_SIZE}px`,
  `height:${MARKER_SIZE}px`,
  "display:flex",
  "align-items:center",
  "justify-content:center",
  "padding:0",
  "margin:0",
  "border:0",
  "border-radius:4px",
  "background:#0096ff",
  "color:#fff",
  // The page surface forces the design cursor on every element with `!important`.
  "cursor:pointer !important",
  "pointer-events:auto",
].join(";");
// Tabler "keyframes" outline icon.
const MARKER_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block;pointer-events:none"><path d="M9.225 18.412a1.595 1.595 0 0 1 -1.225 .588c-.468 0 -.914 -.214 -1.225 -.588l-4.361 -5.248a1.844 1.844 0 0 1 0 -2.328l4.361 -5.248a1.595 1.595 0 0 1 1.225 -.588c.468 0 .914 .214 1.225 .588l4.361 5.248a1.844 1.844 0 0 1 0 2.328l-4.361 5.248"/><path d="M17 5l4.586 5.836a1.844 1.844 0 0 1 0 2.328l-4.586 5.836"/><path d="M13 5l4.586 5.836a1.844 1.844 0 0 1 0 2.328l-4.586 5.836"/></svg>';

export interface RendererAnimationMarkers {
  apply(enabled: boolean): void;
  dispose(): void;
}

/**
 * Pins one keyframes icon to the topmost element of each animation. Clicking an icon selects that element
 * through `onPick`, which sends it down the same path as a normal selection.
 */
export function createRendererAnimationMarkers(
  document: Document = globalThis.document,
  onPick: (target: Element) => boolean = () => false,
): RendererAnimationMarkers {
  const window = document.defaultView;
  let container: HTMLElement | null = null;
  let observer: MutationObserver | null = null;
  let releaseScanTracking: (() => void) | null = null;
  let rescanTimer: ReturnType<typeof setTimeout> | undefined;
  const targets = new WeakMap<Element, Element>();

  const isOwn = (element: Element): boolean =>
    element.id === NUDGE_UI_MOUNT_ID || element.id === CONTAINER_ID || element.closest(`#${NUDGE_UI_MOUNT_ID}, #${CONTAINER_ID}`) !== null;

  /** Inspection briefly attaches a hidden element (`data-nudge-ui`) to read a computed value; that is not a page change. */
  const isInspectorProbe = (mutation: MutationRecord): boolean => {
    const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
    return nodes.length > 0 && nodes.every((node) => node instanceof Element && node.hasAttribute("data-nudge-ui"));
  };

  function render(): void {
    if (!window) return;
    container?.replaceChildren();
    const root = document.documentElement;
    if (!container) {
      container = document.createElement("div");
      container.id = CONTAINER_ID;
      container.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;pointer-events:none";
      root.append(container);
    }
    const startedAt = window.performance.now();
    const byTrigger = new Map<HTMLElement, AnimationGroup[]>();
    for (const group of scanPageAnimations(document, isOwn)) {
      const groups = byTrigger.get(group.trigger) ?? [];
      groups.push(group);
      byTrigger.set(group.trigger, groups);
    }
    container.setAttribute("data-scan-ms", (window.performance.now() - startedAt).toFixed(1));
    let placed = 0;
    for (const [trigger, groups] of byTrigger) {
      if (placed >= MARKER_LIMIT) break;
      const rect = trigger.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const marker = document.createElement("button");
      marker.type = "button";
      marker.setAttribute(MARKER_ATTRIBUTE, "");
      marker.style.cssText = MARKER_STYLE;
      // Page coordinates, kept inside the page's own top-left corner and never against the current scroll.
      marker.style.left = `${Math.max(MARKER_INSET, Math.round(rect.left + rect.width / 2 - MARKER_SIZE / 2 + window.scrollX))}px`;
      marker.style.top = `${Math.max(MARKER_INSET, Math.round(rect.top + rect.height + MARKER_GAP + window.scrollY))}px`;
      marker.innerHTML = MARKER_ICON;
      marker.title = groups.map((group) => group.label).join("\n");
      marker.setAttribute("aria-label", marker.title);
      targets.set(marker, trigger);
      container.append(marker);
      placed += 1;
    }
  }

  function scheduleRender(): void {
    clearTimeout(rescanTimer);
    rescanTimer = setTimeout(render, RESCAN_DELAY_MS);
  }

  // Runs before the selector's own capture handler, which would swallow a click on anything it can't select.
  function onClick(event: MouseEvent): void {
    const marker = event.composedPath().find((node): node is HTMLElement => node instanceof HTMLElement && node.hasAttribute(MARKER_ATTRIBUTE));
    if (!marker) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = targets.get(marker);
    if (target) onPick(target);
  }

  function onPageChange(): void {
    invalidatePageScan();
    scheduleRender();
  }

  /** A class or state attribute the page toggles changes which selectors match; the inspector's own tagging and cursor writes do not. */
  const isPageAttributeChange = (mutation: MutationRecord): boolean => {
    const name = mutation.attributeName ?? "";
    return mutation.type === "attributes"
      && !(mutation.target instanceof Element && isOwn(mutation.target))
      && name !== "style" && name !== "data-cid" && name !== "data-src" && name !== "data-renderer-id"
      && !name.startsWith("data-nudge-ui");
  };

  function observe(): void {
    window?.addEventListener("click", onClick, { capture: true });
    window?.addEventListener("resize", onPageChange);
    // While the markers watch the page, selections reuse their scan instead of walking the page again.
    releaseScanTracking = trackPageScanChanges();
    // Only child changes move the markers; the markers themselves and style changes would otherwise retrigger a scan. Attribute changes only retire the shared scan, so a selection sees the page as it is now.
    observer = new MutationObserver((mutations) => {
      const children = mutations.filter((mutation) => mutation.type === "childList");
      if (children.some((mutation) => !(mutation.target instanceof Element && isOwn(mutation.target)) && !isInspectorProbe(mutation))) onPageChange();
      else if (mutations.some(isPageAttributeChange)) invalidatePageScan();
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  }

  function stop(): void {
    window?.removeEventListener("click", onClick, { capture: true });
    window?.removeEventListener("resize", onPageChange);
    releaseScanTracking?.();
    releaseScanTracking = null;
    observer?.disconnect();
    observer = null;
    clearTimeout(rescanTimer);
    container?.remove();
    container = null;
  }

  let enabled = false;
  return {
    apply(next) {
      if (next === enabled) return;
      enabled = next;
      if (next) {
        // Tracking starts first so the opening scan is the one selections reuse.
        observe();
        render();
      } else {
        stop();
      }
    },
    dispose() {
      enabled = false;
      stop();
    },
  };
}
