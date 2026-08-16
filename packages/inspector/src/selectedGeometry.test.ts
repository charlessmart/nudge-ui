// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { observeSelectedGeometry } from "./selectedGeometry.ts";

describe("observeSelectedGeometry", () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    document.body.replaceChildren();
  });

  it("notifies after a same-parent sibling reorder even when the selected element does not resize", async () => {
    const parent = document.createElement("div");
    const selected = document.createElement("div");
    const sibling = document.createElement("div");
    parent.append(selected, sibling);
    document.body.append(parent);

    const scheduled: FrameRequestCallback[] = [];
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      scheduled.push(callback);
      return scheduled.length;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = (() => undefined) as typeof window.cancelAnimationFrame;

    let notifications = 0;
    const stop = observeSelectedGeometry(selected, () => {
      notifications += 1;
    });

    parent.insertBefore(sibling, selected);
    await Promise.resolve();

    expect(scheduled).toHaveLength(1);
    scheduled[0]?.(0);
    expect(notifications).toBe(1);

    stop();
  });
});
