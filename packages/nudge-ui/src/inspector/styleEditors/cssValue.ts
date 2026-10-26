/** One place that knows what a CSS number is, how to split a value list, and what a property starts at. */

const CSS_NUMBER_SOURCE = "[+-]?(?:(?:\\d+\\.?\\d*)|(?:\\.\\d+))(?:e[+-]?\\d+)?";

export const CSS_LENGTH_UNITS = [
  "px", "rem", "em", "%", "vh", "vw", "vmin", "vmax", "ch", "ex", "cm", "mm", "in", "pt", "pc",
] as const;

export type CssUnit = (typeof CSS_LENGTH_UNITS)[number] | "";

const CSS_NUMBER = new RegExp(`^(?:${CSS_NUMBER_SOURCE})$`, "i");
const CSS_NUMERIC_LITERAL = new RegExp(`^(${CSS_NUMBER_SOURCE})(${CSS_LENGTH_UNITS.join("|")})?$`, "i");

export interface ParsedCssNumber {
  readonly number: number;
  readonly unit: CssUnit;
}

/** True for a bare CSS number with no unit. */
export function isCssNumber(value: string): boolean {
  return CSS_NUMBER.test(value.trim());
}

/** A number with an optional length unit, or null for anything else, including calc() and keywords. */
export function parseCssNumber(value: string): ParsedCssNumber | null {
  const match = CSS_NUMERIC_LITERAL.exec(value.trim());
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  return { number, unit: (match[2]?.toLowerCase() ?? "") as CssUnit };
}

/** Trims float noise and normalises negative zero, so equal values print the same way. */
export function formatCssNumber(value: number): string {
  const rounded = Number(value.toFixed(12));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

export function formatCssNumberWithUnit(value: number, unit: CssUnit): string {
  return `${formatCssNumber(value)}${unit}`;
}

/** Adds `delta` to a numeric value, keeping its unit. Null when the value is not a plain number. */
export function stepCssNumber(value: string, delta: number): string | null {
  const parsed = parseCssNumber(value);
  return parsed ? formatCssNumberWithUnit(parsed.number + delta, parsed.unit) : null;
}

/** Replaces the number and keeps the unit. Null when the value is not a plain number. */
export function withCssNumber(value: string, next: number): string | null {
  const parsed = parseCssNumber(value);
  return parsed ? formatCssNumberWithUnit(next, parsed.unit) : null;
}

/** Splits on top-level commas, ignoring commas inside quotes, parentheses or brackets. */
export function splitCssList(value: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = 0; index < value.length; index++) {
    const character = value[index]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(" || character === "[") depth++;
    else if (character === ")" || character === "]") depth = Math.max(0, depth - 1);
    else if (character === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

/** Splits on top-level whitespace, ignoring whitespace inside quotes, parentheses or brackets. */
export function splitCssTokens(value: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = 0; index < value.length; index++) {
    const character = value[index]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(") depth++;
    else if (character === ")") depth = Math.max(0, depth - 1);
    else if (/\s/.test(character) && depth === 0) {
      if (value.slice(start, index).trim()) parts.push(value.slice(start, index).trim());
      while (/\s/.test(value[index + 1] ?? "")) index++;
      start = index + 1;
    }
  }
  if (value.slice(start).trim()) parts.push(value.slice(start).trim());
  return parts;
}

/** The first item of a comma list, such as a font family list. */
export function firstCssListItem(value: string): string {
  return splitCssList(value)[0] ?? "";
}

export type OptionalSizeProperty = "min-width" | "max-width" | "min-height" | "max-height" | "aspect-ratio";

/**
 * What a size field shows when nothing is authored. Browsers compute a block's `min-width: auto` to `0`, so the
 * display value is `0` even though the property's specified initial value is `auto`.
 */
export const INITIAL_SIZE_VALUES: Readonly<Record<OptionalSizeProperty, string>> = {
  "min-width": "0",
  "min-height": "0",
  "max-width": "none",
  "max-height": "none",
  "aspect-ratio": "auto",
};

/** The layout fields' display defaults, including the size subset above. */
export const INITIAL_LAYOUT_VALUES: Readonly<Record<string, string>> = {
  width: "auto",
  height: "auto",
  ...INITIAL_SIZE_VALUES,
  top: "auto",
  right: "auto",
  bottom: "auto",
  left: "auto",
};

export type SizeLimitProperty = "min-width" | "max-width" | "min-height" | "max-height";

/** What removing a limit writes: the property's specified initial value, which sets no limit. */
export const SIZE_LIMIT_RESET_VALUES: Readonly<Record<SizeLimitProperty, string>> = {
  "min-width": "auto",
  "min-height": "auto",
  "max-width": "none",
  "max-height": "none",
};
