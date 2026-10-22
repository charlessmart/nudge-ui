import { afterEach, describe, expect, it } from "vitest";
import {
  getAnimationBusy,
  getAnimationSpeed,
  getDebugViewMode,
  setAnimationBusy,
  setAnimationSpeed,
  setDebugViewMode,
} from "./debugViewStore.ts";

afterEach(() => {
  setDebugViewMode("outlines");
  setAnimationSpeed(1);
  setAnimationBusy(false);
});

describe("debug view store", () => {
  it("remembers which view the view tool shows, starting with outlines", () => {
    expect(getDebugViewMode()).toBe("outlines");
    setDebugViewMode("explode");
    expect(getDebugViewMode()).toBe("explode");
  });

  it("keeps the playback speed and busy flag independent of the view", () => {
    setAnimationSpeed(0.5);
    setAnimationBusy(true);
    setDebugViewMode("explode");
    expect([getAnimationSpeed(), getAnimationBusy(), getDebugViewMode()]).toEqual([0.5, true, "explode"]);
  });
});
