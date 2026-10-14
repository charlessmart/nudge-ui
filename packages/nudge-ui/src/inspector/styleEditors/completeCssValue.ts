import type { ValuePolicy } from "./valuePolicy.ts";

// Exported as a source fragment for reuse in nudgeValue; matches only a complete CSS <number>.
export const CSS_NUMBER_SOURCE = "[+-]?(?:(?:\\d+\\.?\\d*)|(?:\\.\\d+))(?:e[+-]?\\d+)?";
const BARE_NUMBER = new RegExp(`^(?:${CSS_NUMBER_SOURCE})$`, "i");

/** Commit-time only; never validates or reinterprets arbitrary CSS input. */
export function completeCssValue(rawValue: string, policy: ValuePolicy): string {
  const value = rawValue.trim();

  if (!BARE_NUMBER.test(value) || Number(value) === 0) {
    return value;
  }

  if (policy.kind === "line-height") {
    const multiplier = Number(value);
    // Values up to 10 are multipliers (1.6); larger values are conventional percentages (120).
    if (multiplier > 0 && multiplier <= 10) {
      return `${formatPercentage(multiplier * 100)}%`;
    }
    return `${value}%`;
  }

  if (policy.kind !== "unit") return value;

  return `${value}${policy.defaultUnit}`;
}

function formatPercentage(value: number): string {
  return Number(value.toPrecision(15)).toString();
}
