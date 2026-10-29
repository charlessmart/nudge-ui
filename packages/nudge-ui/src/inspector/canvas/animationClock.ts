// Shared by the hosts' head script and the renderer; `installAnimationClock` is serialized into the page, so it must
// stay self-contained: no imports, no module values, no helpers outside its own body.

/** Where the installed clock lives on the page's window, so a late install reuses the one the host put in `<head>`. */
export const ANIMATION_CLOCK_GLOBAL = "__nudgeUiAnimationClock";

export interface AnimationClock {
  /** How fast page time runs against real time; 1 is real time. */
  readonly rate: number;
  setRate(rate: number): void;
}

/**
 * Dilates the time JavaScript animation reads: `performance.now()` and the timestamp handed to
 * `requestAnimationFrame` callbacks run at `rate` times real time, so libraries that step by elapsed time slow down
 * with it. Frames still arrive at the display's rate. Page time stays monotonic, which means it keeps whatever lag it
 * built up while slowed rather than jumping back to real time and skipping every running animation to its end.
 * `Date.now()` is left alone: application logic reads it as wall-clock time.
 *
 * A library that kept its own reference to `performance.now` before this ran keeps real time, which is why hosts
 * install it as the first script in `<head>`.
 */
export function installAnimationClock(win: Window): AnimationClock {
  const scope = win as Window & { [ANIMATION_CLOCK_GLOBAL]?: AnimationClock };
  // Serialized without its module, so the key is spelled out rather than read from the constant.
  const existing = scope.__nudgeUiAnimationClock;
  if (existing) return existing;
  const performance = win.performance;
  const realNow = performance.now.bind(performance);
  const realRequestFrame = typeof win.requestAnimationFrame === "function" ? win.requestAnimationFrame.bind(win) : null;
  let rate = 1;
  let realAnchor = realNow();
  let pageAnchor = realAnchor;
  const toPageTime = (real: number): number => pageAnchor + (real - realAnchor) * rate;
  const clock: AnimationClock = {
    get rate() {
      return rate;
    },
    setRate(next) {
      if (!(next > 0) || next === rate) return;
      const real = realNow();
      pageAnchor = toPageTime(real);
      realAnchor = real;
      rate = next;
    },
  };
  Object.defineProperty(performance, "now", { configurable: true, writable: true, value: () => toPageTime(realNow()) });
  if (realRequestFrame) {
    win.requestAnimationFrame = (callback) => realRequestFrame((time) => callback(toPageTime(time)));
  }
  Object.defineProperty(win, "__nudgeUiAnimationClock", { configurable: true, value: clock });
  return clock;
}

/** Classic inline script for hosts to put first in `<head>`, ahead of every library that reads the clock. */
export const ANIMATION_CLOCK_SCRIPT = `(${installAnimationClock.toString()})(window);`;
