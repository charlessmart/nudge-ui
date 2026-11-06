import { describe, expect, it } from "vitest";
import { stepFrameHistory, visitFrameUrl } from "./frameHistory.ts";

describe("frame history", () => {
  it("starts at the first URL with nowhere to go", () => {
    const history = visitFrameUrl(null, "/a");
    expect(history).toEqual({ entries: ["/a"], index: 0 });
    expect(stepFrameHistory(history, -1)).toBeNull();
    expect(stepFrameHistory(history, 1)).toBeNull();
  });

  it("ignores a report of the URL it is already on", () => {
    const history = visitFrameUrl(null, "/a");
    expect(visitFrameUrl(history, "/a")).toBe(history);
  });

  it("steps back and forward through visited URLs", () => {
    const history = visitFrameUrl(visitFrameUrl(null, "/a"), "/b");
    const back = stepFrameHistory(history, -1);
    expect(back).toEqual({ entries: ["/a", "/b"], index: 0 });
    expect(stepFrameHistory(back, 1)).toEqual(history);
  });

  it("drops forward entries when a new URL is visited after going back", () => {
    const history = visitFrameUrl(visitFrameUrl(visitFrameUrl(null, "/a"), "/b"), "/c");
    const back = stepFrameHistory(stepFrameHistory(history, -1), -1);
    expect(visitFrameUrl(back, "/d")).toEqual({ entries: ["/a", "/d"], index: 1 });
  });
});
