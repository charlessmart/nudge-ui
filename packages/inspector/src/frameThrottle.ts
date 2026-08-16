export interface FrameScheduler {
  request(callback: FrameRequestCallback): number;
  cancel(handle: number): void;
}

const browserScheduler: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/** Retains only the newest value and performs at most one update per frame. */
export function createFrameThrottle<T>(
  run: (value: T) => void,
  scheduler: FrameScheduler = browserScheduler,
) {
  let handle = 0;
  let latest: T | null = null;

  function runLatest(): void {
    handle = 0;
    const value = latest;
    latest = null;
    if (value !== null) run(value);
  }

  function flush(): void {
    if (handle) scheduler.cancel(handle);
    runLatest();
  }

  const scheduledFlush: FrameRequestCallback = () => {
    runLatest();
  };

  return {
    schedule(value: T): void {
      latest = value;
      if (!handle) handle = scheduler.request(scheduledFlush);
    },
    flush,
    cancel(): void {
      if (handle) scheduler.cancel(handle);
      handle = 0;
      latest = null;
    },
  };
}
