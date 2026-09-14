/**
 * Supported `font` shorthand decomposition (plan slice 3.5).
 *
 * One browser-safe Module decomposes the unambiguous typography longhands
 * affected by a `font` shorthand — family, size, style, weight, and
 * line-height. Omitted optional components are represented by their shorthand
 * reset value. System-font shorthands, percentage-sized variants, and complex
 * family/function forms stay raw so the author's meaning is never guessed.
 */
export const FONT_SYSTEM_KEYWORDS = new Set([
  "caption", "icon", "menu", "message-box", "small-caption", "status-bar",
]);
export const FONT_SIZE_KEYWORDS = new Set([
  "xx-small", "x-small", "small", "medium", "large", "x-large", "xx-large", "xxx-large",
  "larger", "smaller",
]);
export const FONT_WEIGHT_KEYWORDS = new Set(["normal", "bold", "bolder", "lighter"]);
export const FONT_STYLE_KEYWORDS = new Set(["normal", "italic", "oblique"]);

export interface FontShorthandParts {
  "font-family": string;
  "font-size": string;
  "font-style": string;
  "font-weight": string;
  "line-height": string;
}

/**
 * Splits a font shorthand without losing quoted family names or functions.
 * The slash is a token only at top level, which lets us distinguish the
 * optional `font-size / line-height` portion from a slash in a URL/function.
 */
export function splitFontShorthand(value: string): string[] {
  const parts: string[] = [];
  let start = -1;
  let depth = 0;
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < value.length; index++) {
    const char = value[index]!;
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      if (start < 0) start = index;
      continue;
    }
    if (char === "(") {
      depth++;
      if (start < 0) start = index;
      continue;
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0 && (char === "/" || /\s/.test(char))) {
      if (start >= 0) {
        parts.push(value.slice(start, index));
        start = -1;
      }
      if (char === "/") parts.push(char);
      continue;
    }
    if (start < 0) start = index;
  }
  if (start >= 0) parts.push(value.slice(start));
  return parts;
}

export function isFontSize(value: string): boolean {
  const lower = value.toLowerCase();
  return FONT_SIZE_KEYWORDS.has(lower)
    || /^(?:[+-]?(?:\d*\.)?\d+(?:[a-z]+|%)|(?:var|calc|min|max|clamp|env)\()/i.test(value);
}

/**
 * Returns the supported typography longhands affected by an unambiguous
 * `font` shorthand. Omitted optional components are projected as `normal`
 * because a font shorthand resets them; dropping those reset rows would let
 * earlier declarations survive the cascade incorrectly. System-font
 * shorthands and percentage-sized variants remain raw.
 */
export function parseFontShorthand(value: string): FontShorthandParts | null {
  const source = value.trim();
  if (!source || FONT_SYSTEM_KEYWORDS.has(source.toLowerCase())) return null;
  const parts = splitFontShorthand(source);
  const sizeIndex = parts.findIndex(isFontSize);
  if (sizeIndex < 0) return null;
  const fontSize = parts[sizeIndex]!;
  // Percentages may be a preceding font-stretch component or the required
  // size. Keep this uncommon form raw rather than choose arbitrarily.
  if (/^[+-]?(?:\d*\.)?\d+%$/.test(fontSize) && sizeIndex > 0) return null;

  let cursor = sizeIndex + 1;
  let lineHeight: string | undefined;
  if (parts[cursor] === "/") {
    lineHeight = parts[cursor + 1];
    if (!lineHeight) return null;
    cursor += 2;
  }
  const family = parts.slice(cursor).join(" ").trim();
  if (!family) return null;

  let weight: string | undefined;
  let style: string | undefined;
  for (const part of parts.slice(0, sizeIndex)) {
    const lower = part.toLowerCase();
    if (!style && FONT_STYLE_KEYWORDS.has(lower)) {
      style = part;
      continue;
    }
    if (!weight && (FONT_WEIGHT_KEYWORDS.has(lower) || /^(?:[1-9]\d{0,2}|1000)$/.test(part))) {
      weight = part;
      continue;
    }
    // Variant, stretch, angle-bearing oblique, duplicate, and unknown prefix
    // components are valid in wider font grammar but outside this supported
    // projection. Keep the whole shorthand conservative instead of dropping
    // their meaning.
    return null;
  }
  return {
    "font-family": family,
    "font-size": fontSize,
    "font-style": style ?? "normal",
    "font-weight": weight ?? "normal",
    "line-height": lineHeight ?? "normal",
  };
}
