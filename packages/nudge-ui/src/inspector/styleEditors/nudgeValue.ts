import { completeCssValue, CSS_NUMBER_SOURCE } from "./completeCssValue.ts";
import { valuePolicyFor } from "./valuePolicy.ts";

const CSS_NUMBER = new RegExp(`^(?:${CSS_NUMBER_SOURCE})$`, "i");
const CSS_NUMERIC_LITERAL = new RegExp(`^(${CSS_NUMBER_SOURCE})(px|rem|em|%)?$`, "i");
const DRAG_PIXELS_PER_STEP = 4;
const LARGE_DRAG_PIXELS_PER_STEP = 2;

export type NudgeDirection = -1 | 1;

const DRAG_NUDGE_PROPERTY = /^(?:(?:padding|margin)-(?:top|right|bottom|left|horizontal|vertical)|(?:top|right|bottom|left|inset|inset-(?:horizontal|vertical))|(?:row|column)-gap|border-radius|border-(?:top-left|top-right|bottom-right|bottom-left)-radius)$/;

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

  const next = clampNudgeNumber(property, parsed.number + direction * step);

  return `${formatNumber(next)}${parsed.unit}`;
}

/** Returns whether a style field exposes the horizontal drag nudge affordance. */
export function supportsDragNudge(property: string): boolean {
  return DRAG_NUDGE_PROPERTY.test(property);
}

/**
 * Applies one regular nudge per four horizontal pointer pixels and one large
 * nudge per two horizontal pointer pixels. When a large drag starts from an
 * off-grid value, the first step snaps to the next large-step boundary in the
 * drag direction.
 */
export function nudgeCssValueByDrag(
  property: string,
  rawValue: string,
  deltaX: number,
  large = false,
  snapToLargeStep = false,
): string | null {
  const steps = Math.trunc(Math.abs(deltaX) / (large ? LARGE_DRAG_PIXELS_PER_STEP : DRAG_PIXELS_PER_STEP));
  if (steps === 0) return null;

  const direction: NudgeDirection = deltaX < 0 ? -1 : 1;
  let next = rawValue;
  let firstRegularStep = 0;
  if (large && snapToLargeStep) {
    const snapped = snapCssValueToLargeStep(property, next, direction);
    if (snapped === null) return null;
    next = snapped;
    firstRegularStep = 1;
  }
  for (let index = firstRegularStep; index < steps; index += 1) {
    const nudged = nudgeDragStep(property, next, direction, large);
    if (nudged === null) return null;
    next = nudged;
  }
  return next;
}

/** Returns whether a field has a numeric value that can respond to dragging. */
export function canNudgeCssValueByDrag(property: string, rawValue: string): boolean {
  return nudgeCssValueByDrag(property, rawValue, DRAG_PIXELS_PER_STEP) !== null
    || nudgeCssValueByDrag(property, rawValue, -DRAG_PIXELS_PER_STEP) !== null;
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

function nudgeDragStep(
  property: string,
  rawValue: string,
  direction: NudgeDirection,
  large: boolean,
): string | null {
  if (!isAxisPairProperty(property)) return nudgeCssValue(property, rawValue, direction, large);
  const parts = rawValue.split(",").map((part) => part.trim());
  if (parts.length !== 2) return nudgeCssValue(property, rawValue, direction, large);
  const nudgedParts = parts.map((part) => nudgeCssValue(property, part, direction, large));
  if (nudgedParts.some((part) => part === null)) return null;
  return nudgedParts.join(", ");
}

function snapCssValueToLargeStep(
  property: string,
  rawValue: string,
  direction: NudgeDirection,
): string | null {
  if (!isAxisPairProperty(property)) return snapNumericValueToLargeStep(property, rawValue, direction);
  const parts = rawValue.split(",").map((part) => part.trim());
  if (parts.length !== 2) return snapNumericValueToLargeStep(property, rawValue, direction);
  const snappedParts = parts.map((part) => snapNumericValueToLargeStep(property, part, direction));
  if (snappedParts.some((part) => part === null)) return null;
  return snappedParts.join(", ");
}

function snapNumericValueToLargeStep(
  property: string,
  rawValue: string,
  direction: NudgeDirection,
): string | null {
  const normalised = normaliseForNudge(property, rawValue);
  const parsed = parseNumericLiteral(normalised);
  if (!parsed) return null;

  const step = nudgeStep(property, parsed.unit, true);
  if (step === null) return null;

  let next = direction > 0
    ? Math.ceil(parsed.number / step) * step
    : Math.floor(parsed.number / step) * step;
  if ((direction > 0 && next <= parsed.number) || (direction < 0 && next >= parsed.number)) {
    next += direction * step;
  }
  next = clampNudgeNumber(property, next);
  return `${formatNumber(next)}${parsed.unit}`;
}

function isLineHeight(property: string): boolean {
  return property === "line-height" || property.includes("line-height");
}

function isFontWeight(property: string): boolean {
  return property === "font-weight" || property.includes("font-weight");
}

function isNonNegativeDimension(property: string): boolean {
  return /^(?:padding|(?:row|column)-gap|border-(?:top-left|top-right|bottom-right|bottom-left)-radius|border-radius)/.test(property);
}

function isAxisPairProperty(property: string): boolean {
  return /^(?:padding|margin|inset)-(?:horizontal|vertical)$/.test(property);
}

function clampNudgeNumber(property: string, value: number): number {
  if (isFontWeight(property)) return Math.min(1000, Math.max(1, value));
  if (isLineHeight(property) || isNonNegativeDimension(property)) return Math.max(0, value);
  return value;
}

function formatNumber(value: number): string {
  const rounded = Number(value.toFixed(12));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}
