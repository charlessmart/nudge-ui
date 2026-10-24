import { afterEach, describe, expect, it } from "vitest";
import {
  getAnimationBusy,
  getAnimationSpeed,
  getDebugExploded,
  getDebugViewMode,
  setAnimationBusy,
  setAnimationSpeed,
  setDebugExploded,
  setDebugViewMode,
} from "./debugViewStore.ts";

afterEach(() => {
  setDebugViewMode("animation");
  setAnimationSpeed(1);
  setAnimationBusy(false);
  setDebugExploded(false);
});

describe("debug view store", () => {
  it("remembers which view the view tool shows, starting with animation", () => {
    expect(getDebugViewMode()).toBe("animation");
    setDebugViewMode("explode");
    expect(getDebugViewMode()).toBe("explode");
  });

  it("keeps the playback speed and busy flag independent of the view", () => {
    setAnimationSpeed(0.5);
    setAnimationBusy(true);
    setDebugViewMode("explode");
    expect([getAnimationSpeed(), getAnimationBusy(), getDebugViewMode()]).toEqual([0.5, true, "explode"]);
  });

  it("remembers that a renderer is holding a subtree apart, so element chrome can step aside", () => {
    expect(getDebugExploded()).toBe(false);
    setDebugExploded(true);
    expect([getDebugExploded(), getDebugViewMode()]).toEqual([true, "animation"]);
  });
});
