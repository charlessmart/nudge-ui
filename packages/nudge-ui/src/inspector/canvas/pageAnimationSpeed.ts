import { NUDGE_UI_MOUNT_ID } from "../../transport/routes.ts";
import { installAnimationClock, type AnimationClock } from "./animationClock.ts";
import { MIN_ANIMATION_SPEED } from "./animationSpeed.ts";
import { dilatePageTimers } from "./pageTimers.ts";

/** How often a slowed page looks for a GSAP that registered itself after the speed was set. */
const GSAP_POLL_MS = 500;
/**
 * Interactions that can restyle the page without touching the DOM, through `:hover`, `:focus`, `:active`,
 * `:checked` and the like, and so start a CSS animation the mutation observer never hears about.
 */
const RESTYLING_EVENTS = ["pointerover", "pointerout", "pointerdown", "pointerup", "focusin", "focusout", "input", "change"] as const;

interface GsapTimeline {
  timeScale(value?: number): number;
}

export interface PageAnimationSpeed {
  /** Runs every animation on the page at `speed` times its own rate; 1 hands them back untouched. */
  apply(speed: number): void;
  dispose(): void;
}

/** The inspector's own motion, in its mount and the shadow root behind it, keeps its speed. */
function isInspectorNode(node: Node | null): boolean {
  let current = node;
  while (current) {
    if (current instanceof Element && current.id === NUDGE_UI_MOUNT_ID) return true;
    current = current.parentNode ?? (current instanceof ShadowRoot ? current.host : null);
  }
  return false;
}

/** Scroll-driven animations follow the scroll position, so there is no time to slow. */
function isScrollDriven(animation: Animation): boolean {
  const name = animation.timeline?.constructor.name;
  return name === "ScrollTimeline" || name === "ViewTimeline";
}

function animationTarget(animation: Animation): Element | null {
  // SAFETY: KeyframeEffect is the only AnimationEffect with a target; other effects expose no element.
  const target = (animation.effect as KeyframeEffect | null)?.target;
  return target instanceof Element ? target : null;
}

/** GSAP 3 registers itself on `window` when its ticker first wakes, even when the app imports it as a module. */
function gsapTimeline(win: Window): GsapTimeline | null {
  const timeline = (win as Window & { gsap?: { globalTimeline?: GsapTimeline } }).gsap?.globalTimeline;
  return timeline && typeof timeline.timeScale === "function" ? timeline : null;
}

/**
 * Slows the whole page for the Inspection tool. Each kind of motion is slowed by the one control it actually reads,
 * so none is slowed twice:
 * - CSS animations, CSS transitions and `element.animate()` run on the document timeline, so each gets a playback
 *   rate. A CSS animation is created by a style change but reports nothing until its delay has run, which would leave
 *   staggered delays at full speed, so anything that can restyle the page (a DOM mutation, an interaction, a resize)
 *   schedules one sweep of the document's animations on the next frame. The sweep's style flush creates the new
 *   animations before they have started, so their delays are slowed too. `element.animate()` is caught as it is
 *   called, through a wrapped `Element.prototype.animate`.
 * - GSAP reads `Date.now()`, which the clock leaves alone, so its global timeline is time-scaled instead.
 * - Everything stepped from `requestAnimationFrame` or `performance.now()` reads the dilated clock.
 * - `setTimeout` and `setInterval` delays stretch with it, since apps time state changes to their transitions.
 */
export function createPageAnimationSpeed(document: Document = globalThis.document): PageAnimationSpeed {
  const win = document.defaultView;
  let speed = 1;
  let clock: AnimationClock | null = null;
  // The rate each animation had before it was slowed, so a later speed scales from it and 1 restores it.
  const baseRates = new WeakMap<Animation, number>();
  let gsap: { readonly timeline: GsapTimeline; readonly base: number } | null = null;
  let gsapPoll: ReturnType<typeof setInterval> | undefined;
  let originalAnimate: Element["animate"] | null = null;
  let wrappedAnimate: Element["animate"] | null = null;
  let observer: MutationObserver | null = null;
  let sweepFrame: number | null = null;
  let restoreTimers: (() => void) | null = null;
  // Animations the speed never applies to, so a sweep every frame does not walk their ancestors again.
  const ignored = new WeakSet<Animation>();

  const retime = (animation: Animation): void => {
    let base = baseRates.get(animation);
    if (base === undefined) {
      // Nothing to restore for an animation that was never slowed.
      if (speed === 1 || ignored.has(animation)) return;
      if (isScrollDriven(animation) || isInspectorNode(animationTarget(animation))) {
        ignored.add(animation);
        return;
      }
      base = animation.playbackRate;
      baseRates.set(animation, base);
    }
    // Setting the rate keeps the current time, so the animation slows where it is instead of jumping.
    const rate = base * speed;
    if (animation.playbackRate !== rate) animation.playbackRate = rate;
  };

  const sweep = (): void => {
    for (const animation of document.getAnimations?.() ?? []) retime(animation);
  };

  /** Coalesces every restyle in a frame into one sweep. */
  const scheduleSweep = (): void => {
    if (!win || sweepFrame !== null) return;
    sweepFrame = win.requestAnimationFrame(() => {
      sweepFrame = null;
      sweep();
    });
  };

  const retimeGsap = (): void => {
    if (!win) return;
    const timeline = gsapTimeline(win);
    if (gsap && gsap.timeline !== timeline) gsap = null;
    if (!timeline) return;
    gsap ??= { timeline, base: timeline.timeScale() };
    timeline.timeScale(gsap.base * speed);
    if (speed === 1) gsap = null;
  };

  const onAnimationStart = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element) || isInspectorNode(target)) return;
    // A pseudo-element's animation is reported on its host but listed only with the subtree.
    const pseudo = (event as AnimationEvent | TransitionEvent).pseudoElement;
    for (const animation of target.getAnimations(pseudo ? { subtree: true } : undefined)) retime(animation);
  };

  const listen = (): void => {
    if (!win || originalAnimate) return;
    document.addEventListener("animationstart", onAnimationStart, true);
    // `transitionrun` fires when the transition is created, before any delay, so the delay is slowed too.
    document.addEventListener("transitionrun", onAnimationStart, true);
    observer = new win.MutationObserver(scheduleSweep);
    observer.observe(document, { subtree: true, childList: true, attributes: true });
    for (const type of RESTYLING_EVENTS) document.addEventListener(type, scheduleSweep, { capture: true, passive: true });
    // Media queries and `:target`.
    win.addEventListener("resize", scheduleSweep);
    win.addEventListener("hashchange", scheduleSweep);
    const prototype = win.Element.prototype;
    const original = prototype.animate;
    originalAnimate = original;
    wrappedAnimate = function animate(this: Element, ...args: Parameters<Element["animate"]>): Animation {
      const animation = original.apply(this, args);
      retime(animation);
      return animation;
    };
    prototype.animate = wrappedAnimate;
    gsapPoll = setInterval(() => {
      if (gsapTimeline(win) !== gsap?.timeline) retimeGsap();
    }, GSAP_POLL_MS);
    // Paused animations run at a hair above zero, which would push a 300ms timer out by minutes; timers stretch no further than the slowest speed.
    restoreTimers = dilatePageTimers(win, () => Math.max(speed, MIN_ANIMATION_SPEED));
  };

  const stopListening = (): void => {
    if (!win || !originalAnimate) return;
    document.removeEventListener("animationstart", onAnimationStart, true);
    document.removeEventListener("transitionrun", onAnimationStart, true);
    observer?.disconnect();
    observer = null;
    for (const type of RESTYLING_EVENTS) document.removeEventListener(type, scheduleSweep, true);
    win.removeEventListener("resize", scheduleSweep);
    win.removeEventListener("hashchange", scheduleSweep);
    if (sweepFrame !== null) win.cancelAnimationFrame(sweepFrame);
    sweepFrame = null;
    // Another script may have wrapped `animate` after us; unwrapping then would drop its wrapper.
    if (win.Element.prototype.animate === wrappedAnimate) win.Element.prototype.animate = originalAnimate;
    originalAnimate = null;
    wrappedAnimate = null;
    clearInterval(gsapPoll);
    gsapPoll = undefined;
    restoreTimers?.();
    restoreTimers = null;
  };

  const apply = (next: number): void => {
    if (!win || !(next > 0) || next === speed) return;
    speed = next;
    // Installed only once the page is first slowed; a host may already have put it in `<head>`.
    if (speed !== 1) clock ??= installAnimationClock(win);
    clock?.setRate(speed);
    sweep();
    retimeGsap();
    if (speed === 1) stopListening();
    else listen();
  };

  return {
    apply,
    dispose() {
      apply(1);
      stopListening();
    },
  };
}
