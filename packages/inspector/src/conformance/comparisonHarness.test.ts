// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { COLOR_CASES } from "./colorCases.ts";
import { BORDER_CASES } from "./borderCases.ts";
import { SPACING_CASES } from "./spacingCases.ts";
import { TYPOGRAPHY_CASES } from "./typographyCases.ts";
import {
  compareCorpusInterpretation,
  compareFixtureInterpretation,
  createValueSemanticsInterpreter,
} from "./comparisonHarness.ts";

const CORPUS = [
  ...COLOR_CASES,
  ...BORDER_CASES,
  ...SPACING_CASES,
  ...TYPOGRAPHY_CASES,
] as const;

/**
 * Migration guardrail (plan slice 3.1→3.2): the "new" value interpretation
 * runs the real `@design-tool/css` value-semantics interpreter for token
 * references, aliases, leaves, cycles, origins, and modifiers (with the
 * integration's color/opacity/capability/structure policies still coming from
 * the legacy path). It must report zero behavioral diffs across every fixture.
 */
describe("migration comparison harness", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  for (const fixture of CORPUS) {
    it(`${fixture.id}: new interpretation matches the legacy cascade`, () => {
      const diffs = compareFixtureInterpretation(fixture, createValueSemanticsInterpreter());
      expect(diffs).toEqual([]);
    });
  }

  it("reports zero behavioral diffs across the whole conformance corpus", () => {
    const diffs = compareCorpusInterpretation(CORPUS, createValueSemanticsInterpreter());
    expect(diffs).toEqual([]);
  });
});
