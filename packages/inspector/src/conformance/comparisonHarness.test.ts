// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { COLOR_CASES } from "./colorCases.ts";
import { BORDER_CASES } from "./borderCases.ts";
import { SPACING_CASES } from "./spacingCases.ts";
import { TYPOGRAPHY_CASES } from "./typographyCases.ts";
import {
  compareCorpusInterpretation,
  compareFixtureInterpretation,
  createLegacyDelegatingInterpreter,
} from "./comparisonHarness.ts";

const CORPUS = [
  ...COLOR_CASES,
  ...BORDER_CASES,
  ...SPACING_CASES,
  ...TYPOGRAPHY_CASES,
] as const;

/**
 * Migration guardrail (plan slice 3.1): the "new" value interpretation does
 * not exist yet, so this test runs the harness with a legacy-delegating
 * interpreter. It must report zero behavioral diffs across every fixture.
 * Later slices replace the delegation with real interpretations behind the
 * `@design-tool/css/value-semantics` seam and this test catches drift.
 */
describe("migration comparison harness", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  for (const fixture of CORPUS) {
    it(`${fixture.id}: new interpretation matches the legacy cascade`, () => {
      const diffs = compareFixtureInterpretation(fixture, createLegacyDelegatingInterpreter());
      expect(diffs).toEqual([]);
    });
  }

  it("reports zero behavioral diffs across the whole conformance corpus", () => {
    const diffs = compareCorpusInterpretation(CORPUS, createLegacyDelegatingInterpreter());
    expect(diffs).toEqual([]);
  });
});
