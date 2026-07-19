// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { assertConformanceFixture, runConformanceFixture } from "./fixture.ts";
import { COLOR_CASES } from "./colorCases.ts";

describe("shared color conformance corpus", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  for (const fixture of COLOR_CASES) {
    it(fixture.id, () => {
      const result = runConformanceFixture(fixture);
      try {
        expect(assertConformanceFixture(result, fixture)).toEqual([]);
      } finally {
        result.cleanup();
      }
    });
  }
});
