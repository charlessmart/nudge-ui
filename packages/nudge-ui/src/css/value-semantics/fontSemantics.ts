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

/** The slash is a token only at top level, so URLs and functions survive. */
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

/** Omitted optional components project as their shorthand reset value; dropping those rows would let earlier declarations survive the cascade. */
export function parseFontShorthand(value: string): FontShorthandParts | null {
  const source = value.trim();
  if (!source || FONT_SYSTEM_KEYWORDS.has(source.toLowerCase())) return null;
  const parts = splitFontShorthand(source);
  const sizeIndex = parts.findIndex(isFontSize);
  if (sizeIndex < 0) return null;
  const fontSize = parts[sizeIndex]!;
  // A leading percentage may be font-stretch, not the required size; keep this uncommon form raw rather than choose arbitrarily.
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
    // Components outside this supported projection keep the whole shorthand conservative instead of dropping their meaning.
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
