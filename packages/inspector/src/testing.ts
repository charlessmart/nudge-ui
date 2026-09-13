/**
 * Test and conformance helpers for validating the inspector through a
 * consumer-facing entry point. Keep these exports out of the runtime entry.
 */
export { assertConformanceFixture, runConformanceFixture } from "./conformance/fixture.ts";
export type {
  ConformanceFixture,
  ConformanceResult,
  ConformancePropertyExpectation,
  ConformanceProjectionExpectation,
  ConformanceProjectionFieldExpectation,
} from "./conformance/fixture.ts";
export { BORDER_CASES } from "./conformance/borderCases.ts";
export { COLOR_CASES } from "./conformance/colorCases.ts";
export { SPACING_CASES } from "./conformance/spacingCases.ts";
export { TYPOGRAPHY_CASES } from "./conformance/typographyCases.ts";
