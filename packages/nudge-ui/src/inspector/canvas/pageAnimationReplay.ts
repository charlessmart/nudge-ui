import { NUDGE_UI_MOUNT_ID } from "../../transport/routes.ts";

interface GsapChild {
  restart?(): unknown;
}

interface GsapGlobalTimeline {
  getChildren?(nested?: boolean, tweens?: boolean, timelines?: boolean): GsapChild[];
}

/** The inspector's own motion, in its mount and the shadow root behind it, is not the page's to replay. */
function isInspectorNode(node: Node | null): boolean {
  let current = node;
  while (current) {
    if (current instanceof Element && current.id === NUDGE_UI_MOUNT_ID) return true;
    current = current.parentNode ?? (current instanceof ShadowRoot ? current.host : null);
  }
  return false;
}

/** Scroll-driven animations follow the scroll position, so there is no start to return to. */
function isScrollDriven(animation: Animation): boolean {
  const name = animation.timeline?.constructor.name;
  return name === "ScrollTimeline" || name === "ViewTimeline";
}

function animationTarget(animation: Animation): Element | null {
  // SAFETY: KeyframeEffect is the only AnimationEffect with a target; other effects expose no element.
  const target = (animation.effect as KeyframeEffect | null)?.target;
  return target instanceof Element ? target : null;
}

/**
 * Restarts every CSS animation on the page. One that has finished is no longer listed in `getAnimations()`, so it is
 * started again the way a stylesheet would: its `animation-name` is dropped for a style flush, then put back exactly as
 * the page had it.
 */
function restartCssAnimations(document: Document): void {
  const win = document.defaultView;
  if (!win) return;
  const restarted: Array<{ readonly element: HTMLElement | SVGElement; readonly value: string; readonly priority: string }> = [];
  for (const element of document.querySelectorAll("*")) {
    if (!(element instanceof win.HTMLElement || element instanceof win.SVGElement) || isInspectorNode(element)) continue;
    if (win.getComputedStyle(element).animationName === "none") continue;
    restarted.push({
      element,
      value: element.style.getPropertyValue("animation-name"),
      priority: element.style.getPropertyPriority("animation-name"),
    });
  }
  for (const { element } of restarted) element.style.setProperty("animation-name", "none", "important");
  // Commits the dropped animations, so putting the names back starts them over.
  void document.documentElement.getBoundingClientRect();
  for (const { element, value, priority } of restarted) {
    if (value) element.style.setProperty("animation-name", value, priority);
    else element.style.removeProperty("animation-name");
    if (element.getAttribute("style") === "") element.removeAttribute("style");
  }
}

/** Sends every other running or held animation, transitions and `element.animate()` included, back to its start. */
function rewindAnimations(document: Document): void {
  for (const animation of document.getAnimations?.() ?? []) {
    // A CSS animation was restarted above, from its stylesheet.
    if ("animationName" in animation) continue;
    if (isScrollDriven(animation) || isInspectorNode(animationTarget(animation))) continue;
    animation.currentTime = 0;
    animation.play();
  }
}

function restartGsap(win: Window): void {
  const timeline = (win as Window & { gsap?: { globalTimeline?: GsapGlobalTimeline } }).gsap?.globalTimeline;
  if (typeof timeline?.getChildren !== "function") return;
  for (const child of timeline.getChildren(false, true, true)) child.restart?.();
}

/**
 * Plays every animation on the page again from its start, at whatever speed the Inspection tool has set. Motion
 * driven by hand from `requestAnimationFrame` has no start to return to, so it keeps running where it is.
 */
export function replayPageAnimations(document: Document = globalThis.document): void {
  const win = document.defaultView;
  if (!win) return;
  restartCssAnimations(document);
  rewindAnimations(document);
  restartGsap(win);
}
