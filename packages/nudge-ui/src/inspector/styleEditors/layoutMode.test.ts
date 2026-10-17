import { describe, expect, it } from "vitest";
import { layoutModeEdits, layoutModeOf } from "./layoutMode.ts";

describe("layoutModeOf", () => {
  it("reads flex orientation, grid and block, and nothing for other displays", () => {
    expect(layoutModeOf("flex", "row")).toBe("row");
    expect(layoutModeOf("inline-flex", "column-reverse")).toBe("column");
    expect(layoutModeOf("grid", "row")).toBe("grid");
    expect(layoutModeOf("block", "row")).toBe("block");
    expect(layoutModeOf("inline", "row")).toBeNull();
    expect(layoutModeOf("none", "row")).toBeNull();
  });
});

describe("layoutModeEdits", () => {
  it("writes the display and a non-default direction when leaving block", () => {
    expect(layoutModeEdits({ display: "block", flexDirection: "row" }, "column")).toEqual([
      { property: "display", value: "flex" },
      { property: "flex-direction", value: "column" },
    ]);
  });

  it("omits the initial row direction when moving from a non-flex display", () => {
    expect(layoutModeEdits({ display: "block", flexDirection: "row" }, "row")).toEqual([
      { property: "display", value: "flex" },
    ]);
  });

  it("changes only the direction between flex orientations and keeps reverse", () => {
    expect(layoutModeEdits({ display: "flex", flexDirection: "row-reverse" }, "column")).toEqual([
      { property: "flex-direction", value: "column-reverse" },
    ]);
  });

  it("keeps an inline outer display", () => {
    expect(layoutModeEdits({ display: "inline-flex", flexDirection: "row" }, "grid")).toEqual([
      { property: "display", value: "inline-grid" },
    ]);
    expect(layoutModeEdits({ display: "inline-grid", flexDirection: "row" }, "block")).toEqual([
      { property: "display", value: "inline-block" },
    ]);
  });

  it("does nothing when already in the mode", () => {
    expect(layoutModeEdits({ display: "grid", flexDirection: "row" }, "grid")).toEqual([]);
  });

  it("writes every property for an unknown current state", () => {
    expect(layoutModeEdits(null, "row")).toEqual([
      { property: "display", value: "flex" },
      { property: "flex-direction", value: "row" },
    ]);
  });
});
