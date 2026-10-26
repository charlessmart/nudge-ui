import { afterEach, describe, expect, it } from "vitest";
import { clearFramesExploded, isFrameExploded, setFrameExploded } from "./frameViewState.ts";

afterEach(() => clearFramesExploded());

describe("frame view state", () => {
  it("keeps each card's exploded phase separate", () => {
    setFrameExploded("card-1", true);
    expect([isFrameExploded("card-1"), isFrameExploded("card-2")]).toEqual([true, false]);

    setFrameExploded("card-2", true);
    setFrameExploded("card-2", false);
    expect([isFrameExploded("card-1"), isFrameExploded("card-2")]).toEqual([true, false]);
  });

  it("ignores a repeated report and a card with no selection", () => {
    setFrameExploded("card-1", false);
    expect(isFrameExploded("card-1")).toBe(false);
    expect(isFrameExploded(null)).toBe(false);
  });

  it("clears every card when the view is put away", () => {
    setFrameExploded("card-1", true);
    setFrameExploded("card-2", true);
    clearFramesExploded();
    expect([isFrameExploded("card-1"), isFrameExploded("card-2")]).toEqual([false, false]);
  });
});
