/** The script a stack frame runs in, without its line and column; Chromium writes `at fn (url:1:2)`, Firefox `fn@url:1:2`. */
function frameScript(frame: string): string | null {
  return /([^\s()@]+):\d+:\d+\)?$/.exec(frame.trim())?.[1] ?? null;
}

function stackScripts(stack: string | undefined): string[] {
  return (stack ?? "").split("\n").map(frameScript).filter((script): script is string => script !== null);
}

/** The script this module was loaded from: the inspector's bundle, whose own timers keep real time. */
const INSPECTOR_SCRIPT = stackScripts(new Error().stack)[0] ?? null;

/** Whether the timer was asked for by the inspector itself: the frame past this function, `scaled` and the timer wrapper. */
function requestedByInspector(): boolean {
  return INSPECTOR_SCRIPT !== null && stackScripts(new Error().stack)[3] === INSPECTOR_SCRIPT;
}

/**
 * Stretches `setTimeout` and `setInterval` delays by the page's slowdown. Components commonly hold a state change
 * until a transition should have ended on a timer of the same length, then finish or unmount what was animating; at
 * real speed that timer would cut every slowed transition short. The inspector shares the page's window on the page
 * surface, so a timer it asks for itself keeps real time. Timers already pending keep the delay they were given.
 *
 * Returns a restore, which leaves the timers alone if another script has wrapped them since.
 */
export function dilatePageTimers(win: Window, speed: () => number): () => void {
  const realSetTimeout = win.setTimeout;
  const realSetInterval = win.setInterval;
  const scaled = (delay: number | undefined): number | undefined => {
    if (!delay || requestedByInspector()) return delay;
    return delay / speed();
  };
  // SAFETY: Each wrapper forwards its arguments unchanged to the real timer, so it keeps the real timer's signature.
  const setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) =>
    realSetTimeout.call(win, handler, scaled(delay), ...args)) as typeof win.setTimeout;
  // SAFETY: As above, the wrapper only rescales the delay it forwards.
  const setInterval = ((handler: TimerHandler, delay?: number, ...args: unknown[]) =>
    realSetInterval.call(win, handler, scaled(delay), ...args)) as typeof win.setInterval;
  win.setTimeout = setTimeout;
  win.setInterval = setInterval;
  return () => {
    if (win.setTimeout === setTimeout) win.setTimeout = realSetTimeout;
    if (win.setInterval === setInterval) win.setInterval = realSetInterval;
  };
}
