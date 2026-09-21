import { completeCssValue, CSS_NUMBER_SOURCE } from "./completeCssValue.ts";
import { valuePolicyFor } from "./valuePolicy.ts";

const CSS_NUMBER = new RegExp(`^(?:${CSS_NUMBER_SOURCE})$`, "i");
const CSS_NUMERIC_LITERAL = new RegExp(`^(${CSS_NUMBER_SOURCE})(px|rem|em|%)?$`, "i");

export type NudgeDirection = -1 | 1;

interface ParsedNumericLiteral {
  number: number;
  unit: "px" | "rem" | "em" | "%" | "";
}

/**
 * Returns a nudged CSS numeric literal, or null when the value is not a
 * standalone number that the inspector can safely edit.
 */
export function nudgeCssValue(
  property: string,
  rawValue: string,
  direction: NudgeDirection,
  large = false,
): string | null {
  const normalised = normaliseForNudge(property, rawValue);
  const parsed = parseNumericLiteral(normalised);
  if (!parsed) return null;

  const step = nudgeStep(property, parsed.unit, large);
  if (step === null) return null;

  let next = parsed.number + direction * step;
  if (isFontWeight(property)) next = Math.min(1000, Math.max(1, next));
  if (isLineHeight(property)) next = Math.max(0, next);

  return `${formatNumber(next)}${parsed.unit}`;
}

/** Returns a clamped opacity percentage nudged by 1%, or 10% with Shift. */
export function nudgeOpacityValue(
  rawValue: string,
  direction: NudgeDirection,
  large = false,
): string | null {
  const parsed = parseNumericLiteral(rawValue);
  if (!parsed || parsed.unit !== "%") return null;

  const step = large ? 10 : 1;
  const next = Math.min(100, Math.max(0, parsed.number + direction * step));
  return `${formatNumber(next)}%`;
}

function normaliseForNudge(property: string, rawValue: string): string {
  const value = rawValue.trim();
  if (!CSS_NUMBER.test(value)) return value;
  const normalised = completeCssValue(value, valuePolicyFor(isLineHeight(property) ? "line-height" : property));
  return isLineHeight(property) && normalised === "0" ? "0%" : normalised;
}

function parseNumericLiteral(value: string): ParsedNumericLiteral | null {
  const match = CSS_NUMERIC_LITERAL.exec(value.trim());
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  // SAFETY: the regex guarantees match[2] is one of the known CSS unit strings.
  const unit = (match[2] ?? "").toLowerCase() as ParsedNumericLiteral["unit"];
  return { number, unit };
}

function nudgeStep(property: string, unit: ParsedNumericLiteral["unit"], large: boolean): number | null {
  if (isFontWeight(property)) return large ? 800 : 100;
  if (isLineHeight(property) && unit === "%") return large ? 80 : 10;

  if (unit === "px" || unit === "%" || unit === "") return large ? 8 : 1;
  if (unit === "rem" || unit === "em") return large ? 1 : 0.125;
  return null;
}

function isLineHeight(property: string): boolean {
  return property === "line-height" || property.includes("line-height");
}

function isFontWeight(property: string): boolean {
  return property === "font-weight" || property.includes("font-weight");
}

function formatNumber(value: number): string {
  const rounded = Number(value.toFixed(12));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}
