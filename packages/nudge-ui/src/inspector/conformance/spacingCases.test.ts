// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { assertConformanceFixture, runConformanceFixture } from "./fixture.ts";
import { SPACING_CASES } from "./spacingCases.ts";

describe("shared spacing conformance corpus", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  for (const fixture of SPACING_CASES) {
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
