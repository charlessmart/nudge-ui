import { describe, expect, it } from "vitest";
import { readTextTruncation, truncationDeclarations } from "./textTruncation.ts";

function reader(values: Record<string, string>) {
  const defaults: Record<string, string> = {
    display: "block",
    overflow: "visible",
    "overflow-x": "visible",
    "text-overflow": "clip",
    "white-space": "normal",
    "-webkit-line-clamp": "none",
  };
  return (property: string) => values[property] ?? defaults[property] ?? "";
}

describe("readTextTruncation", () => {
  it("reads untruncated text as none", () => {
    expect(readTextTruncation(reader({}))).toBe("none");
  });

  it("reads a clipped, unwrapped ellipsis as one line", () => {
    expect(readTextTruncation(reader({ overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }))).toBe("1");
  });

  it("reads text kept on one line by text-wrap as one line", () => {
    expect(readTextTruncation(reader({ overflow: "hidden", "text-overflow": "ellipsis", "text-wrap-mode": "nowrap" }))).toBe("1");
  });

  it("needs the overflow clipped before an ellipsis shows", () => {
    expect(readTextTruncation(reader({ "text-overflow": "ellipsis", "white-space": "nowrap" }))).toBe("none");
  });

  it("reads a line clamp as its line count", () => {
    expect(readTextTruncation(reader({ display: "-webkit-box", "-webkit-line-clamp": "3", overflow: "hidden" }))).toBe("3");
  });

  it("keeps a clamp longer than the offered choices", () => {
    expect(readTextTruncation(reader({ display: "-webkit-box", "-webkit-line-clamp": "6", overflow: "hidden" }))).toBe("6");
  });

  it("ignores a line clamp the display does not apply", () => {
    expect(readTextTruncation(reader({ "-webkit-line-clamp": "3", overflow: "hidden" }))).toBe("none");
  });
});

describe("truncationDeclarations", () => {
  it("truncates to one line with an ellipsis", () => {
    expect(truncationDeclarations("none", "1")).toEqual([
      { property: "overflow", value: "hidden" },
      { property: "text-overflow", value: "ellipsis" },
      { property: "white-space", value: "nowrap" },
    ]);
  });

  it("clamps to several lines and lets the text wrap again", () => {
    expect(truncationDeclarations("1", "3")).toEqual([
      { property: "white-space", value: "normal" },
      { property: "display", value: "-webkit-box" },
      { property: "-webkit-box-orient", value: "vertical" },
      { property: "-webkit-line-clamp", value: "3" },
      { property: "overflow", value: "hidden" },
    ]);
  });

  it("undoes only what the current form set", () => {
    expect(truncationDeclarations("2", "none")).toEqual([
      { property: "-webkit-line-clamp", value: "none" },
      { property: "display", value: "block" },
      { property: "overflow", value: "visible" },
    ]);
    expect(truncationDeclarations("1", "none")).toEqual([
      { property: "text-overflow", value: "clip" },
      { property: "white-space", value: "normal" },
      { property: "overflow", value: "visible" },
    ]);
  });

  it("writes nothing when the truncation does not change", () => {
    expect(truncationDeclarations("2", "2")).toEqual([]);
  });
});
