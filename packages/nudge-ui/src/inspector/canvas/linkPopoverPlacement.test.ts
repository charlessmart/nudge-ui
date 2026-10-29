import { describe, expect, it } from "vitest";
import { placeLinkPopover } from "./linkPopoverPlacement.ts";

const size = { width: 140, height: 28 };
const board = { left: 0, top: 0, width: 1200, height: 800 };

describe("placeLinkPopover", () => {
  it("centers the action immediately above the link", () => {
    const link = { left: 500, top: 300, width: 200, height: 40 };
    expect(placeLinkPopover({ kind: "rect", rect: link }, size, board)).toEqual({
      left: 530,
      top: 264,
    });
  });

  it("drops below the link when the board leaves no room above it", () => {
    const link = { left: 500, top: 20, width: 200, height: 40 };
    expect(placeLinkPopover({ kind: "rect", rect: link }, size, board)).toEqual({
      left: 530,
      top: 68,
    });
  });

  it("keeps the action inside the board when the link sits near an edge", () => {
    const link = { left: 1150, top: 300, width: 40, height: 20 };
    expect(placeLinkPopover({ kind: "rect", rect: link }, size, board)?.left).toBe(1052);
  });

  it("falls back to the pointer when the frame reports no link rect", () => {
    expect(placeLinkPopover({ kind: "point", x: 400, y: 300 }, size, board)).toEqual({
      left: 414,
      top: 318,
    });
  });

  it("returns no position without an anchor", () => {
    expect(placeLinkPopover(null, size, board)).toBeNull();
  });
});
