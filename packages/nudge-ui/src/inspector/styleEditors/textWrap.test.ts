import { describe, expect, it } from "vitest";
import { readTextWrap } from "./textWrap.ts";

const reader = (values: Record<string, string>) => (property: string) => values[property] ?? "";

describe("readTextWrap", () => {
  it("reads default wrapping as normal", () => {
    expect(readTextWrap(reader({ "text-wrap-mode": "wrap", "text-wrap-style": "auto" }))).toBe("wrap");
  });

  it("reads a nowrap mode as none, whatever the style", () => {
    expect(readTextWrap(reader({ "text-wrap-mode": "nowrap", "text-wrap-style": "balance" }))).toBe("nowrap");
  });

  it("reads pretty and balanced styles", () => {
    expect(readTextWrap(reader({ "text-wrap-mode": "wrap", "text-wrap-style": "pretty" }))).toBe("pretty");
    expect(readTextWrap(reader({ "text-wrap-mode": "wrap", "text-wrap-style": "balance" }))).toBe("balance");
  });

  it("falls back to white-space where the browser has no text-wrap-mode", () => {
    expect(readTextWrap(reader({ "white-space": "nowrap" }))).toBe("nowrap");
    expect(readTextWrap(reader({ "white-space": "normal" }))).toBe("wrap");
  });
});
