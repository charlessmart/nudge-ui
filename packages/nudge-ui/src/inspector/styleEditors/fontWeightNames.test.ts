import { describe, expect, it } from "vitest";
import { fontWeightName, fontWeightValue } from "./fontWeightNames.ts";

describe("fontWeightName", () => {
  it("names the standard weights", () => {
    expect(fontWeightName("400")).toBe("Regular");
    expect(fontWeightName("600")).toBe("Semibold");
    expect(fontWeightName("700")).toBe("Bold");
  });

  it("names the weight keywords", () => {
    expect(fontWeightName("normal")).toBe("Regular");
    expect(fontWeightName("bold")).toBe("Bold");
  });

  it("leaves a variable font's in-between weights as numbers", () => {
    expect(fontWeightName("450")).toBe("450");
    expect(fontWeightName("650")).toBe("650");
  });

  it("leaves relative and expression weights as written", () => {
    expect(fontWeightName("bolder")).toBe("bolder");
    expect(fontWeightName("var(--weight)")).toBe("var(--weight)");
  });
});

describe("fontWeightValue", () => {
  it("writes a name as its number, whatever its case or spacing", () => {
    expect(fontWeightValue("Semibold")).toBe("600");
    expect(fontWeightValue("semi-bold")).toBe("600");
    expect(fontWeightValue("extra bold")).toBe("800");
    expect(fontWeightValue("REGULAR")).toBe("400");
  });

  it("leaves numbers and other values as typed", () => {
    expect(fontWeightValue("650")).toBe("650");
    expect(fontWeightValue("bolder")).toBe("bolder");
  });
});
