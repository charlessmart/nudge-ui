import { splitTopLevelWhitespace } from "./cssSyntax.ts";
import {
  interpretTokenValue,
  type TokenInterpretationContext,
  type TokenValueInterpretation,
} from "./tokenInterpretation.ts";

export const BORDER_STYLES = new Set(["none", "hidden", "dotted", "dashed", "solid", "double", "groove", "ridge", "inset", "outset"]);
export const BORDER_WIDTHS = new Set(["thin", "medium", "thick"]);
export const COLOR_KEYWORDS = new Set(["transparent", "currentcolor", "black", "silver", "gray", "white", "maroon", "red", "purple", "fuchsia", "green", "lime", "olive", "yellow", "navy", "blue", "teal", "aqua", "orange"]);
export const BORDER_CSS_WIDE = new Set(["inherit", "initial", "unset", "revert", "revert-layer"]);
/** CSS initial values for omitted `border` / `border-*` shorthand components. */
export const BORDER_INITIAL = { width: "medium", style: "none", color: "currentcolor" } as const;

export interface BorderComponents {
  width: string;
  style: string;
  color: string;
  widthResult: TokenValueInterpretation;
  styleResult: TokenValueInterpretation;
  colorResult: TokenValueInterpretation;
}

/** Conservative decomposition; null when the value cannot be split faithfully. */
export function parseBorderComponents(value: string, tokenContext: TokenInterpretationContext): BorderComponents | null {
  const trimmed = value.trim();
  if (!trimmed || BORDER_CSS_WIDE.has(trimmed.toLowerCase())) return null;

  const parts = splitTopLevelWhitespace(trimmed);
  // One to three components in any order; more is multi-value / junk.
  if (parts.length === 0 || parts.length > 3) return null;

  let width = "";
  let style = "";
  let color = "";
  const interpretations = new Map<string, TokenValueInterpretation>();
  const interpret = (component: string): TokenValueInterpretation => {
    const cached = interpretations.get(component);
    if (cached) return cached;
    const result = interpretTokenValue(component, tokenContext);
    interpretations.set(component, result);
    return result;
  };
  for (const part of parts) {
    // Reject image layers and non-token slash forms (e.g. `red / 10%`).
    if (/^(?:url|image|cross-fade|element|image-set|linear-gradient|radial-gradient|conic-gradient|repeating-linear-gradient|repeating-radial-gradient|repeating-conic-gradient)\(/i.test(part)) {
      return null;
    }
    if (part.includes("/") && !/^var\(/i.test(part)) return null;

    const isVariable = /^var\(\s*--[\w-]+(?:\s*,[\s\S]*)?\s*\)$/i.test(part);
    const interpreted = isVariable ? interpret(part).resolvedValue.trim() : part;
    // A custom property can substitute an entire shorthand; unresolved or
    // multi-component results cannot be assigned to one slot.
    if (isVariable && (/^var\(/i.test(interpreted) || splitTopLevelWhitespace(interpreted).length !== 1)) return null;
    const candidate = interpreted.toLowerCase();
    const isWidth = BORDER_WIDTHS.has(candidate)
      || /^(?:0|[+-]?(?:\d*\.)?\d+(?:px|rem|em|%)?)$/i.test(interpreted);
    const isStyle = BORDER_STYLES.has(candidate);
    const isColor = COLOR_KEYWORDS.has(candidate)
      || /^(?:#|rgb\(|rgba\(|hsl\(|hsla\(|hwb\(|lab\(|lch\(|oklab\(|oklch\(|color\(|color-mix\()/i.test(interpreted);

    if (!width && isWidth) width = part;
    else if (!style && isStyle) style = part;
    else if (!color && isColor) color = part;
    else return null;
  }

  // Omitted components take the CSS initial for that longhand (not inherited).
  if (!width) width = BORDER_INITIAL.width;
  if (!style) style = BORDER_INITIAL.style;
  if (!color) color = BORDER_INITIAL.color;

  return {
    width,
    style,
    color,
    widthResult: interpret(width),
    styleResult: interpret(style),
    colorResult: interpret(color),
  };
}
