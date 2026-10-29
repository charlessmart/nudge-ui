import { describe, expect, it, vi } from "vitest";
import { dilatePageTimers } from "./pageTimers.ts";

type Timer = (handler: TimerHandler, delay?: number, ...args: unknown[]) => number;

function fakeWindow() {
  return { setTimeout: vi.fn<Timer>(() => 1), setInterval: vi.fn<Timer>(() => 2) };
}

describe("dilatePageTimers", () => {
  it("stretches the page's timeouts and intervals by the slowdown, at the speed when each is set", () => {
    const win = fakeWindow();
    const { setTimeout: realTimeout, setInterval: realInterval } = win;
    let speed = 0.25;
    dilatePageTimers(win as unknown as Window, () => speed);
    const handler = () => undefined;

    expect(win.setTimeout(handler, 150, "arg")).toBe(1);
    win.setInterval(handler, 100);
    speed = 0.5;
    win.setTimeout(handler, 150);

    expect(realTimeout.mock.calls).toEqual([[handler, 600, "arg"], [handler, 300]]);
    expect(realInterval.mock.calls).toEqual([[handler, 400]]);
  });

  it("leaves a zero or missing delay alone", () => {
    const win = fakeWindow();
    const realTimeout = win.setTimeout;
    dilatePageTimers(win as unknown as Window, () => 0.25);
    const handler = () => undefined;
    win.setTimeout(handler);
    win.setTimeout(handler, 0);
    expect(realTimeout.mock.calls).toEqual([[handler, undefined], [handler, 0]]);
  });

  it("restores the real timers, unless another script wrapped them since", () => {
    const win = fakeWindow();
    const { setTimeout: realTimeout, setInterval: realInterval } = win;
    const restore = dilatePageTimers(win as unknown as Window, () => 0.25);
    const theirs = vi.fn<Timer>();
    win.setInterval = theirs;
    restore();
    expect(win.setTimeout).toBe(realTimeout);
    expect(win.setInterval).toBe(theirs);
    expect(win.setInterval).not.toBe(realInterval);
  });
});
