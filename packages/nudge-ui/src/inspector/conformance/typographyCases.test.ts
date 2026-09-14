// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { assertConformanceFixture, runConformanceFixture } from "./fixture.ts";
import { TYPOGRAPHY_CASES } from "./typographyCases.ts";

describe("shared typography conformance corpus", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  for (const fixture of TYPOGRAPHY_CASES) {
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
