import { describe, expect, it } from "vitest";
import { createFrameThrottle, type FrameScheduler } from "./frameThrottle.ts";

function scheduler(): { scheduler: FrameScheduler; flush(): void; cancelled: number[] } {
  let callback: FrameRequestCallback | null = null;
  const cancelled: number[] = [];
  return {
    scheduler: {
      request(next): number {
        callback = next;
        return 1;
      },
      cancel(handle): void {
        cancelled.push(handle);
        callback = null;
      },
    },
    flush(): void {
      callback?.(0);
    },
    cancelled,
  };
}

describe("createFrameThrottle", () => {
  it("coalesces a burst into one update with the newest value", () => {
    const fake = scheduler();
    const seen: number[] = [];
    const throttle = createFrameThrottle((value: number) => seen.push(value), fake.scheduler);

    throttle.schedule(1);
    throttle.schedule(2);
    throttle.schedule(3);
    fake.flush();

    expect(seen).toEqual([3]);
  });

  it("cancels a queued update", () => {
    const fake = scheduler();
    const seen: number[] = [];
    const throttle = createFrameThrottle((value: number) => seen.push(value), fake.scheduler);

    throttle.schedule(1);
    throttle.cancel();
    fake.flush();

    expect(seen).toEqual([]);
    expect(fake.cancelled).toEqual([1]);
  });

  it("flushes the newest queued value synchronously", () => {
    const fake = scheduler();
    const seen: number[] = [];
    const throttle = createFrameThrottle((value: number) => seen.push(value), fake.scheduler);

    throttle.schedule(1);
    throttle.schedule(2);
    throttle.flush();
    fake.flush();

    expect(seen).toEqual([2]);
    expect(fake.cancelled).toEqual([1]);
  });
});
