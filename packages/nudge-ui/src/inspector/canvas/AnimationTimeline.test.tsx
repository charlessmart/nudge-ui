// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimationTimeline, scrollProgressTicks, timelineTicks } from "./AnimationTimeline.tsx";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("timelineTicks", () => {
  it("labels whole seconds for a multi-second animation with twenty minor marks between", () => {
    const ticks = timelineTicks(3000);
    expect(ticks.filter((tick) => tick.label).map((tick) => tick.label)).toEqual(["0", "1s", "2s"]);
    expect(ticks.filter((tick) => tick.major).map((tick) => tick.ms)).toEqual([0, 1000, 2000, 3000]);
    expect(ticks).toHaveLength(61);
  });

  it("labels bare milliseconds for short animations and gives the final mark no label", () => {
    const labelled = timelineTicks(150).filter((tick) => tick.label);
    expect(labelled.map((tick) => tick.label)).toEqual(["0", "50", "100"]);
    // A duration a hair over a mark still has no room for another label.
    expect(timelineTicks(150.0000001).filter((tick) => tick.label).map((tick) => tick.label)).toEqual(["0", "50", "100"]);
  });

  it("has no marks before an animation is captured", () => {
    expect(timelineTicks(0)).toEqual([]);
  });
});

describe("scrollProgressTicks", () => {
  it("labels scroll progress in percentages and leaves the end of the track unlabelled", () => {
    const ticks = scrollProgressTicks();
    expect(ticks.filter((tick) => tick.label).map((tick) => tick.label)).toEqual(["0%", "25%", "50%", "75%"]);
    expect(ticks.filter((tick) => tick.major).map((tick) => tick.ms)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
});

/** jsdom has no PointerEvent; React only reads `pointerId` and the mouse fields from it. */
function pointerEvent(type: string, init: MouseEventInit): Event {
  return Object.assign(new MouseEvent(type, { bubbles: true, ...init }), { pointerId: 1 });
}

describe("AnimationTimeline", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function render(props: Partial<Parameters<typeof AnimationTimeline>[0]> & { onSeek: (progress: number) => void }): HTMLElement {
    act(() => {
      root.render(createElement(AnimationTimeline, { progress: 0.25, duration: 1000, ...props }));
    });
    return host.querySelector<HTMLElement>('[data-test="animation-scrubber"]')!;
  }

  it("labels a scroll timeline as progress percentages", () => {
    const timeline = render({ onSeek: vi.fn(), mode: "scroll", duration: 0 });
    expect(timeline.getAttribute("aria-label")).toBe("Scroll progress");
    expect([...host.querySelectorAll(".animation-timeline__label")].map((label) => label.textContent)).toEqual(["0%", "25%", "50%", "75%"]);
  });

  it("seeks to where the pointer presses and keeps following it while dragged", () => {    const onSeek = vi.fn();
    const timeline = render({ onSeek });
    const scale = host.querySelector<HTMLElement>(".animation-timeline__scale")!;
    scale.getBoundingClientRect = () => ({ left: 100, width: 202, top: 0, height: 40, right: 302, bottom: 40, x: 100, y: 0 } as DOMRect);
    timeline.setPointerCapture = vi.fn();
    timeline.hasPointerCapture = vi.fn(() => true);

    act(() => {
      timeline.dispatchEvent(pointerEvent("pointerdown", { clientX: 151, button: 0 }));
      timeline.dispatchEvent(pointerEvent("pointermove", { clientX: 261 }));
      timeline.dispatchEvent(pointerEvent("pointermove", { clientX: 500 }));
    });

    expect(onSeek.mock.calls.map(([progress]) => progress)).toEqual([0.25, 0.8, 1]);
  });

  it("reports scrubbing from the press until the pointer is released or lost", () => {
    const onScrubChange = vi.fn();
    const timeline = render({ onSeek: vi.fn(), onScrubChange });
    timeline.setPointerCapture = vi.fn();
    timeline.hasPointerCapture = vi.fn(() => true);

    act(() => {
      timeline.dispatchEvent(pointerEvent("pointerdown", { clientX: 150, button: 0 }));
    });
    expect(onScrubChange.mock.calls).toEqual([[true]]);
    act(() => {
      timeline.dispatchEvent(pointerEvent("pointerup", { clientX: 150 }));
    });
    expect(onScrubChange.mock.calls).toEqual([[true], [false]]);
  });

  it("grows the marks around the playhead, the closest the most", () => {
    const falloff = (progress: number) => {
      render({ onSeek: vi.fn(), progress, duration: 1000 });
      const levels: Record<number, number> = {};
      host.querySelectorAll<HTMLElement>(".animation-timeline__tick").forEach((tick, index) => {
        const proximity = tick.style.getPropertyValue("--tick-proximity");
        if (proximity) levels[index] = Number(proximity);
      });
      return levels;
    };
    // 1000ms is marked every 200ms with a minor mark every 10ms, so 500ms is mark 50. The rise decays exponentially: e^-1 two marks out, and nothing past five.
    expect(falloff(0.5)).toEqual({
      45: 0.08, 46: 0.14, 47: 0.22, 48: 0.37, 49: 0.61, 50: 1, 51: 0.61, 52: 0.37, 53: 0.22, 54: 0.14, 55: 0.08,
    });
    expect(falloff(0)).toEqual({ 0: 1, 1: 0.61, 2: 0.37, 3: 0.22, 4: 0.14, 5: 0.08 });
    expect(falloff(1)).toEqual({ 95: 0.08, 96: 0.14, 97: 0.22, 98: 0.37, 99: 0.61, 100: 1 });
    // Between two marks both are equally near.
    expect(falloff(0.505)).toMatchObject({ 50: 0.78, 51: 0.78 });
  });

  it("flags only the marks the playhead is leaving as falling, until they rise again", () => {
    const falling = () => [...host.querySelectorAll<HTMLElement>(".animation-timeline__tick")]
      .flatMap((tick, index) => (tick.hasAttribute("data-falling") ? [index] : []));
    render({ onSeek: vi.fn(), progress: 0, duration: 1000 });
    expect(falling()).toEqual([]);

    // Moving to mark 50 raises the marks there; none of them are falling, and the old ones are.
    render({ onSeek: vi.fn(), progress: 0.5, duration: 1000 });
    expect(falling()).toEqual([0, 1, 2, 3, 4, 5]);

    // They stay flagged while nothing changes, so a settling ease isn't cut short.
    render({ onSeek: vi.fn(), progress: 0.5, duration: 1000 });
    expect(falling()).toEqual([0, 1, 2, 3, 4, 5]);

    // Back at the start they rise again, instantly.
    render({ onSeek: vi.fn(), progress: 0, duration: 1000 });
    expect(falling()).toEqual([45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55]);
  });

  it("leaves the marks to the playhead alone while the pointer merely hovers", () => {
    const onSeek = vi.fn();
    const timeline = render({ onSeek, progress: 0, duration: 1000 });
    const scale = host.querySelector<HTMLElement>(".animation-timeline__scale")!;
    scale.getBoundingClientRect = () => ({ left: 100, width: 202, top: 0, height: 36, right: 302, bottom: 36, x: 100, y: 0 } as DOMRect);
    timeline.hasPointerCapture = vi.fn(() => false);
    const levels = () => {
      const found: Record<number, number> = {};
      host.querySelectorAll<HTMLElement>(".animation-timeline__tick").forEach((tick, index) => {
        const proximity = tick.style.getPropertyValue("--tick-proximity");
        if (proximity) found[index] = Number(proximity);
      });
      return found;
    };
    // Only the playhead's marks at the start.
    expect(levels()).toEqual({ 0: 1, 1: 0.61, 2: 0.37, 3: 0.22, 4: 0.14, 5: 0.08 });

    // 201 is the middle of the 200px of travel and 301 its far end; neither raises a mark.
    act(() => {
      timeline.dispatchEvent(pointerEvent("pointermove", { clientX: 201 }));
      timeline.dispatchEvent(pointerEvent("pointermove", { clientX: 301 }));
    });
    expect(levels()).toEqual({ 0: 1, 1: 0.61, 2: 0.37, 3: 0.22, 4: 0.14, 5: 0.08 });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("sweeps the marks along with the playhead while a press glides", () => {
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    try {
      const onSeek = vi.fn();
      const timeline = render({ onSeek, progress: 0, duration: 1000 });
      const scale = host.querySelector<HTMLElement>(".animation-timeline__scale")!;
      scale.getBoundingClientRect = () => ({ left: 100, width: 202, top: 0, height: 36, right: 302, bottom: 36, x: 100, y: 0 } as DOMRect);
      timeline.setPointerCapture = vi.fn();
      const levels = () => {
        const found: Record<number, number> = {};
        host.querySelectorAll<HTMLElement>(".animation-timeline__tick").forEach((tick, index) => {
          const proximity = tick.style.getPropertyValue("--tick-proximity");
        if (proximity) found[index] = Number(proximity);
        });
        return found;
      };

      // A press at the far end seeks there, and the parent hands the new progress back.
      act(() => {
        timeline.dispatchEvent(pointerEvent("pointerdown", { clientX: 301, button: 0 }));
      });
      expect(onSeek).toHaveBeenCalledWith(1);
      render({ onSeek, progress: 1, duration: 1000 });

      // Until the travel starts the marks stay around the old spot, not the target.
      expect(timeline.hasAttribute("data-gliding")).toBe(true);
      expect(levels()).toEqual({ 0: 1, 1: 0.61, 2: 0.37, 3: 0.22, 4: 0.14, 5: 0.08 });

      // Halfway through the glide they have risen around the travelled playhead, not either end.
      act(() => {
        frames[0]!(1_000);
        frames[1]!(1_075);
      });
      expect(levels()).toEqual({ 70: 0.08, 71: 0.14, 72: 0.22, 73: 0.37, 74: 0.61, 75: 1, 76: 0.61, 77: 0.37, 78: 0.22, 79: 0.14, 80: 0.08 });

      // The last frame lands them on the target.
      act(() => {
        frames[2]!(1_150);
      });
      expect(levels()).toEqual({ 95: 0.08, 96: 0.14, 97: 0.22, 98: 0.37, 99: 0.61, 100: 1 });
      expect(timeline.hasAttribute("data-gliding")).toBe(false);
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  it("glides the playhead only after a press on the track", () => {
    const timeline = render({ onSeek: vi.fn() });
    timeline.setPointerCapture = vi.fn();
    timeline.hasPointerCapture = vi.fn(() => true);
    expect(timeline.hasAttribute("data-gliding")).toBe(false);

    vi.useFakeTimers();
    try {
      act(() => {
        timeline.dispatchEvent(pointerEvent("pointerdown", { clientX: 150, button: 0 }));
      });
      expect(timeline.hasAttribute("data-gliding")).toBe(true);
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(timeline.hasAttribute("data-gliding")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("steps with the arrow keys and ignores input while disabled", () => {
    const onSeek = vi.fn();
    const timeline = render({ onSeek });
    act(() => {
      timeline.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
      timeline.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Home" }));
    });
    expect(onSeek.mock.calls.map(([progress]) => progress)).toEqual([0.26, 0]);

    const disabled = vi.fn();
    const inert = render({ onSeek: disabled, disabled: true });
    act(() => {
      inert.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
      inert.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, button: 0 }));
    });
    expect(disabled).not.toHaveBeenCalled();
  });
});
