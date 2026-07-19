// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { assertConformanceFixture, runConformanceFixture } from "./fixture.ts";
import { BORDER_CASES } from "./borderCases.ts";

describe("shared border conformance corpus", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  for (const fixture of BORDER_CASES) {
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
