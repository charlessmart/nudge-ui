import { NUDGE_UI_MOUNT_ID } from "../../transport/routes.ts";
import { scanPageAnimations, type AnimationGroup } from "./animationScan.ts";

const CONTAINER_ID = "nudge-ui-animation-markers";
const MARKER_ATTRIBUTE = "data-nudge-ui-animation-marker";
const MARKER_LIMIT = 150;
const RESCAN_DELAY_MS = 400;
// Matches the DOM navigator chip in InspectorOverlay.css; the page has no access to the inspector's CSS variables.
const MARKER_STYLE = [
  "position:absolute",
  "z-index:2147483645",
  "box-sizing:border-box",
  "max-width:160px",
  "height:24px",
  "padding:0 8px",
  "margin:0",
  "overflow:hidden",
  "border:0",
  "border-radius:4px",
  "background:#0096ff",
  "color:#fff",
  "font:400 12px/24px Inter Variable,Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
  "text-overflow:ellipsis",
  "white-space:nowrap",
  "cursor:pointer",
  "pointer-events:auto",
].join(";");

export interface RendererAnimationMarkers {
  apply(enabled: boolean): void;
  dispose(): void;
}

function markerLabel(groups: readonly AnimationGroup[]): string {
  return groups.length > 1 ? `${groups.length} animations` : groups[0]!.label;
}

/**
 * Pins one label to the topmost element of each animation. Clicking a label selects that element
 * through `onPick`, which sends it down the same path as a normal selection.
 */
export function createRendererAnimationMarkers(
  document: Document = globalThis.document,
  onPick: (target: Element) => boolean = () => false,
): RendererAnimationMarkers {
  const window = document.defaultView;
  let container: HTMLElement | null = null;
  let observer: MutationObserver | null = null;
  let rescanTimer: ReturnType<typeof setTimeout> | undefined;
  const targets = new WeakMap<Element, Element>();

  const isOwn = (element: Element): boolean =>
    element.id === NUDGE_UI_MOUNT_ID || element.id === CONTAINER_ID || element.closest(`#${NUDGE_UI_MOUNT_ID}, #${CONTAINER_ID}`) !== null;

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
      marker.style.left = `${Math.round(rect.left + window.scrollX)}px`;
      marker.style.top = `${Math.max(0, Math.round(rect.top + window.scrollY) - 12)}px`;
      marker.textContent = markerLabel(groups);
      marker.title = groups.map((group) => group.label).join("\n");
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

  function observe(): void {
    window?.addEventListener("click", onClick, { capture: true });
    window?.addEventListener("resize", scheduleRender);
    // Children only: the markers themselves and style changes would otherwise retrigger a scan.
    observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => !(mutation.target instanceof Element && isOwn(mutation.target)))) scheduleRender();
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  }

  function stop(): void {
    window?.removeEventListener("click", onClick, { capture: true });
    window?.removeEventListener("resize", scheduleRender);
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
        render();
        observe();
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
