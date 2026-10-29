import { describe, expect, it } from "vitest";
import { ANIMATION_CLOCK_SCRIPT, installAnimationClock, type AnimationClock } from "./animationClock.ts";

interface FakeWindow {
  performance: { now: () => number };
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  __nudgeUiAnimationClock?: AnimationClock;
}

/** A window whose real clock and frames the test drives by hand. */
function fakeWindow(): { win: FakeWindow; advance: (ms: number) => void; frame: () => void } {
  let real = 1_000;
  const callbacks: FrameRequestCallback[] = [];
  const win: FakeWindow = {
    performance: { now: () => real },
    requestAnimationFrame: (callback) => callbacks.push(callback),
  };
  return {
    win,
    advance: (ms) => {
      real += ms;
    },
    frame: () => {
      for (const callback of callbacks.splice(0)) callback(real);
    },
  };
}

function install(win: FakeWindow): AnimationClock {
  return installAnimationClock(win as unknown as Window);
}

describe("animation clock", () => {
  it("passes real time through until it is slowed", () => {
    const { win, advance } = fakeWindow();
    install(win);
    advance(500);
    expect(win.performance.now()).toBe(1_500);
  });

  it("slows performance.now and frame timestamps by the rate, and keeps its lag when set back to real time", () => {
    const { win, advance, frame } = fakeWindow();
    const clock = install(win);
    clock.setRate(0.25);
    advance(400);
    expect(win.performance.now()).toBe(1_100);

    const stamps: number[] = [];
    win.requestAnimationFrame((time) => stamps.push(time));
    frame();
    expect(stamps).toEqual([1_100]);

    clock.setRate(1);
    advance(100);
    // Monotonic: the 300ms it fell behind is kept, rather than jumping every animation forward.
    expect(win.performance.now()).toBe(1_200);
  });

  it("ignores rates that would stop or reverse time", () => {
    const { win, advance } = fakeWindow();
    const clock = install(win);
    clock.setRate(0);
    clock.setRate(-1);
    clock.setRate(Number.NaN);
    advance(100);
    expect([clock.rate, win.performance.now()]).toEqual([1, 1_100]);
  });

  it("reuses the clock a host already installed, so time is only dilated once", () => {
    const { win, advance } = fakeWindow();
    const early = install(win);
    const late = install(win);
    expect(late).toBe(early);
    late.setRate(0.5);
    advance(100);
    expect(win.performance.now()).toBe(1_050);
  });

  it("runs as a self-contained head script", () => {
    const { win, advance } = fakeWindow();
    // Evaluated as hosts inline it into `<head>`, with no module around it.
    new Function("window", ANIMATION_CLOCK_SCRIPT)(win);
    win.__nudgeUiAnimationClock!.setRate(0.5);
    advance(100);
    expect(win.performance.now()).toBe(1_050);
  });
});
