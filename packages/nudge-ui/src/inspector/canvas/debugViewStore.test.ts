import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_ANIMATION_SPEED,
  getAnimationSpeed,
  getAnimationsPaused,
  getExplodeView,
  getOutlinesView,
  setAnimationSpeed,
  setAnimationsPaused,
  setExplodeView,
  setOutlinesView,
} from "./debugViewStore.ts";

afterEach(() => {
  setOutlinesView(false);
  setExplodeView(false);
  setAnimationSpeed(DEFAULT_ANIMATION_SPEED);
  setAnimationsPaused(false);
});

describe("debug view store", () => {
  it("starts with both views off and switches each on its own", () => {
    expect([getOutlinesView(), getExplodeView()]).toEqual([false, false]);
    setExplodeView(true);
    expect([getOutlinesView(), getExplodeView()]).toEqual([false, true]);
    setOutlinesView(true);
    expect([getOutlinesView(), getExplodeView()]).toEqual([true, true]);
  });

  it("starts slowed and keeps the speed independent of the views", () => {
    expect(getAnimationSpeed()).toBe(DEFAULT_ANIMATION_SPEED);
    setAnimationSpeed(0.5);
    setExplodeView(true);
    expect([getAnimationSpeed(), getExplodeView()]).toEqual([0.5, true]);
  });

  it("pauses animations without losing the speed the slider is set to", () => {
    expect(getAnimationsPaused()).toBe(false);
    setAnimationSpeed(0.6);
    setAnimationsPaused(true);
    expect([getAnimationsPaused(), getAnimationSpeed()]).toEqual([true, 0.6]);
    setAnimationsPaused(false);
    expect([getAnimationsPaused(), getAnimationSpeed()]).toEqual([false, 0.6]);
  });
});
