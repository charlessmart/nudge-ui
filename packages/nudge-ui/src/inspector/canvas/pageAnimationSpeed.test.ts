// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NUDGE_UI_MOUNT_ID } from "../../transport/routes.ts";
import { PAUSED_ANIMATION_SPEED } from "./animationSpeed.ts";
import { createPageAnimationSpeed, type PageAnimationSpeed } from "./pageAnimationSpeed.ts";

/** jsdom has no Web Animations; the controller only reads a target, a timeline and the playback rate. */
function fakeAnimation(target: Element | null, { playbackRate = 1, timeline = "DocumentTimeline" } = {}): Animation {
  class Timeline {}
  Object.defineProperty(Timeline, "name", { value: timeline });
  return { effect: { target }, timeline: new Timeline(), playbackRate } as unknown as Animation;
}

type GsapStub = { globalTimeline: { scale: number; timeScale(value?: number): number } };

function gsapStub(scale = 1): GsapStub {
  return {
    globalTimeline: {
      scale,
      timeScale(value) {
        if (value !== undefined) this.scale = value;
        return this.scale;
      },
    },
  };
}

describe("page animation speed", () => {
  let running: Animation[];
  let speed: PageAnimationSpeed;
  const originalAnimate = Element.prototype.animate;
  const originalNow = performance.now;
  const originalRequestFrame = window.requestAnimationFrame;

  beforeEach(() => {
    running = [];
    Object.defineProperty(document, "getAnimations", { configurable: true, value: () => running });
    Element.prototype.animate = function animate(this: Element) {
      const animation = fakeAnimation(this);
      running.push(animation);
      return animation;
    };
    speed = createPageAnimationSpeed(document);
  });

  afterEach(() => {
    speed.dispose();
    Element.prototype.animate = originalAnimate;
    Reflect.deleteProperty(document, "getAnimations");
    Reflect.deleteProperty(window, "gsap");
    // The clock stays installed for the page's lifetime; the tests need a fresh one each time.
    Reflect.deleteProperty(window, "__nudgeUiAnimationClock");
    Object.defineProperty(performance, "now", { configurable: true, writable: true, value: originalNow });
    window.requestAnimationFrame = originalRequestFrame;
    document.body.replaceChildren();
  });

  it("scales every running animation from its own rate, and restores it at full speed", () => {
    const fast = fakeAnimation(document.body, { playbackRate: 2 });
    const plain = fakeAnimation(document.body);
    running.push(fast, plain);

    speed.apply(0.25);
    expect([fast.playbackRate, plain.playbackRate]).toEqual([0.5, 0.25]);
    speed.apply(0.5);
    expect([fast.playbackRate, plain.playbackRate]).toEqual([1, 0.5]);
    speed.apply(1);
    expect([fast.playbackRate, plain.playbackRate]).toEqual([2, 1]);
  });

  it("leaves scroll-driven animations and the inspector's own motion alone", () => {
    const mount = document.createElement("div");
    mount.id = NUDGE_UI_MOUNT_ID;
    const inShadow = document.createElement("span");
    mount.attachShadow({ mode: "open" }).append(inShadow);
    document.body.append(mount);
    const scroll = fakeAnimation(document.body, { timeline: "ScrollTimeline" });
    const inspector = fakeAnimation(inShadow);
    running.push(scroll, inspector);

    speed.apply(0.25);
    expect([scroll.playbackRate, inspector.playbackRate]).toEqual([1, 1]);
  });

  it("slows animations that start after the speed was set", () => {
    speed.apply(0.25);
    const scripted = document.body.animate([], 1000);
    expect(scripted.playbackRate).toBe(0.25);

    const card = document.createElement("div");
    document.body.append(card);
    const transition = fakeAnimation(card);
    card.getAnimations = () => [transition];
    card.dispatchEvent(new Event("transitionrun", { bubbles: true }));
    expect(transition.playbackRate).toBe(0.25);
  });

  it("catches a CSS animation on the frame after the DOM changes, before its delay has run", async () => {
    const frames: FrameRequestCallback[] = [];
    window.requestAnimationFrame = (callback) => frames.push(callback);
    speed.apply(0.25);
    const card = document.createElement("div");
    document.body.append(card);
    await Promise.resolve();
    frames.splice(0).forEach((frame) => frame(0));

    // The class change is what creates the animation, still in its delay; nothing has announced it.
    const staggered = fakeAnimation(card);
    running.push(staggered);
    card.className = "enter";
    await Promise.resolve();
    expect(frames).toHaveLength(1);
    frames.splice(0).forEach((frame) => frame(16));
    expect(staggered.playbackRate).toBe(0.25);
  });

  it("sweeps after an interaction that restyles through a pseudo-class, once per frame", () => {
    const frames: FrameRequestCallback[] = [];
    window.requestAnimationFrame = (callback) => frames.push(callback);
    speed.apply(0.25);
    const hovered = fakeAnimation(document.body);
    running.push(hovered);
    document.body.dispatchEvent(new Event("pointerover", { bubbles: true }));
    document.body.dispatchEvent(new Event("focusin", { bubbles: true }));
    expect(frames).toHaveLength(1);
    frames.splice(0).forEach((frame) => frame(16));
    expect(hovered.playbackRate).toBe(0.25);
  });

  it("stops sweeping at full speed", async () => {
    const frames: FrameRequestCallback[] = [];
    window.requestAnimationFrame = (callback) => frames.push(callback);
    speed.apply(0.25);
    speed.apply(1);
    document.body.append(document.createElement("div"));
    document.body.dispatchEvent(new Event("pointerover", { bubbles: true }));
    await Promise.resolve();
    expect(frames).toHaveLength(0);
  });

  it("unwraps element.animate at full speed", () => {
    const pageAnimate = Element.prototype.animate;
    speed.apply(0.25);
    expect(Element.prototype.animate).not.toBe(pageAnimate);
    speed.apply(1);
    expect(Element.prototype.animate).toBe(pageAnimate);
    expect(document.body.animate([], 1000).playbackRate).toBe(1);
  });

  it("time-scales GSAP from its own scale, including a GSAP that registers later", () => {
    vi.useFakeTimers();
    try {
      speed.apply(0.5);
      const gsap = gsapStub(2);
      Object.assign(window, { gsap });
      vi.advanceTimersByTime(500);
      expect(gsap.globalTimeline.scale).toBe(1);
      speed.apply(1);
      expect(gsap.globalTimeline.scale).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("dilates the page clock while slowed", () => {
    const start = performance.now();
    speed.apply(0.1);
    const clock = (window as Window & { __nudgeUiAnimationClock?: { rate: number } }).__nudgeUiAnimationClock;
    expect(clock?.rate).toBe(0.1);
    expect(performance.now()).toBeGreaterThanOrEqual(start);
    speed.apply(1);
    expect(clock?.rate).toBe(1);
  });

  it("holds animations at a hair above zero while paused, without stretching timers past the slowest speed", () => {
    const animation = fakeAnimation(document.body);
    running.push(animation);
    vi.useFakeTimers();
    try {
      speed.apply(PAUSED_ANIMATION_SPEED);
      expect(animation.playbackRate).toBe(PAUSED_ANIMATION_SPEED);
      const fired = vi.fn();
      window.setTimeout(fired, 100);
      // A 100ms timer waits ten times as long, as it would at the slowest speed, not a thousand times.
      vi.advanceTimersByTime(999);
      expect(fired).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(fired).toHaveBeenCalledTimes(1);
      speed.apply(1);
      expect(animation.playbackRate).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
