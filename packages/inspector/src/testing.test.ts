// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import * as runtime from "./index.ts";
import * as testing from "./testing.ts";

describe("inspector package entry points", () => {
  it("keeps conformance helpers and fixtures out of the runtime entry", () => {
    expect(runtime).not.toHaveProperty("assertConformanceFixture");
    expect(runtime).not.toHaveProperty("runConformanceFixture");
    expect(runtime).not.toHaveProperty("TYPOGRAPHY_CASES");
  });

  it("exposes the shared conformance surface from the testing entry", () => {
    expect(testing.COLOR_CASES.length).toBeGreaterThan(0);
    expect(testing.SPACING_CASES.length).toBeGreaterThan(0);
    expect(testing.BORDER_CASES.length).toBeGreaterThan(0);
    expect(testing.TYPOGRAPHY_CASES.length).toBeGreaterThan(0);
    expect(testing.runConformanceFixture).toEqual(expect.any(Function));
    expect(testing.assertConformanceFixture).toEqual(expect.any(Function));
  });
});
