import type { ValuePolicy } from "./valuePolicy.ts";

// CSS <number>, including values such as .5 and 1e3. This intentionally only
// matches the entire value: units, functions, keywords, and compound values
// are all valid raw CSS and must be passed through unchanged.
const BARE_NUMBER = /^[+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:e[+-]?\d+)?$/i;

/**
 * Completes a bare numeric entry with its property's default unit. This is a
 * commit-time formatter; it deliberately does not validate or reinterpret
 * arbitrary CSS supplied by the user.
 */
export function completeCssValue(rawValue: string, policy: ValuePolicy): string {
  const value = rawValue.trim();

  if (!BARE_NUMBER.test(value) || Number(value) === 0) {
    return value;
  }

  if (policy.kind === "line-height") {
    const multiplier = Number(value);
    // People commonly enter line-height as its CSS multiplier (1.6), while
    // larger whole values conventionally represent a percentage (120). Keep
    // both convenient forms while committing a single percentage value.
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
