import type { ValuePolicy } from "./valuePolicy.ts";
import { formatCssNumber, isCssNumber } from "./cssValue.ts";

/** Commit-time only; never validates or reinterprets arbitrary CSS input. */
export function completeCssValue(rawValue: string, policy: ValuePolicy): string {
  const value = rawValue.trim();

  if (!isCssNumber(value) || Number(value) === 0) {
    return value;
  }

  if (policy.kind === "line-height") {
    const multiplier = Number(value);
    // Values up to 10 are multipliers (1.6); larger values are conventional percentages (120).
    if (multiplier > 0 && multiplier <= 10) {
      return `${formatCssNumber(multiplier * 100)}%`;
    }
    return `${value}%`;
  }

  if (policy.kind !== "unit") return value;

  return `${value}${policy.defaultUnit}`;
}
