/**
 * Border shorthand structure (plan slice 3.5).
 *
 * One browser-safe Module owns the conservative `border` / `border-side`
 * shorthand decomposition: width/style/color parts, CSS initial values for
 * omitted components, css-wide-keyword rejection, and the explicit rejection
 * of image layers, non-token slash forms, and ambiguous component counts.
 *
 * Browser-safe contract: this module imports only the shared model and the
 * value-semantics token interpreter. It never touches the DOM or CSSOM.
 */
import type { BorderStructure, TokenTable } from "../model/index.ts";
import { splitTopLevelWhitespace } from "./cssSyntax.ts";
import { interpretTokenValue } from "./tokenInterpretation.ts";

export const BORDER_STYLES = new Set(["none", "hidden", "dotted", "dashed", "solid", "double", "groove", "ridge", "inset", "outset"]);
export const BORDER_WIDTHS = new Set(["thin", "medium", "thick"]);
export const COLOR_KEYWORDS = new Set(["transparent", "currentcolor", "black", "silver", "gray", "white", "maroon", "red", "purple", "fuchsia", "green", "lime", "olive", "yellow", "navy", "blue", "teal", "aqua", "orange"]);
export const BORDER_CSS_WIDE = new Set(["inherit", "initial", "unset", "revert", "revert-layer"]);
/** CSS initial values for omitted `border` / `border-*` shorthand components. */
export const BORDER_INITIAL = { width: "medium", style: "none", color: "currentcolor" } as const;

/** Width/style/color components of a decomposable border value. */
export interface BorderComponents {
  width: string;
  style: string;
  color: string;
}

/**
 * Pure border-shorthand classification: splits the authored value into
 * width/style/color components with CSS initial values for omitted parts, or
 * returns null when the value cannot be decomposed faithfully (ambiguous
 * component order, image layers, non-token slash forms, css-wide keywords, or
 * multi-value junk). Performs no token interpretation.
 */
export function parseBorderComponents(value: string, tokenTable: TokenTable): BorderComponents | null {
  const trimmed = value.trim();
  if (!trimmed || BORDER_CSS_WIDE.has(trimmed.toLowerCase())) return null;

  const parts = splitTopLevelWhitespace(trimmed);
  // One to three components in any order; more is multi-value / junk.
  if (parts.length === 0 || parts.length > 3) return null;

  let width = "";
  let style = "";
  let color = "";
  for (const part of parts) {
    const lower = part.toLowerCase();
    // Reject image layers and non-token slash forms (e.g. `red / 10%`).
    if (/^(?:url|image|cross-fade|element|image-set|linear-gradient|radial-gradient|conic-gradient|repeating-linear-gradient|repeating-radial-gradient|repeating-conic-gradient)\(/i.test(part)) {
      return null;
    }
    if (part.includes("/") && !/^var\(/i.test(part)) return null;

    const varName = /^var\(\s*(--[\w-]+)/i.exec(part)?.[1];
    const varValue = varName ? tokenTable[varName]?.value ?? "" : "";
    const isWidth = BORDER_WIDTHS.has(lower)
      || /^(?:0|[+-]?(?:\d*\.)?\d+(?:px|rem|em|%)?)$/i.test(part)
      || (varName !== undefined && /^(?:0|[+-]?(?:\d*\.)?\d+(?:px|rem|em|%)?)$/i.test(varValue.trim()));
    const isStyle = BORDER_STYLES.has(lower);
    const isColor = COLOR_KEYWORDS.has(lower)
      || /^(?:#|rgb\(|rgba\(|hsl\(|hsla\(|hwb\(|lab\(|lch\(|oklab\(|oklch\(|var\(\s*--)/i.test(part);

    if (!width && isWidth) width = part;
    else if (!style && isStyle) style = part;
    else if (!color && isColor) color = part;
    else return null;
  }

  // Omitted components take the CSS initial for that longhand (not inherited).
  if (!width) width = BORDER_INITIAL.width;
  if (!style) style = BORDER_INITIAL.style;
  if (!color) color = BORDER_INITIAL.color;

  return { width, style, color };
}

/**
 * Parses a `border` / `border-side` shorthand into its width/style/color
 * structure, or returns null when the value cannot be decomposed faithfully.
 * The color token name is resolved against the given table without local-alias
 * or framework policy; the structured interpretation (`interpretStructuredValue`)
 * reuses one full-context interpretation for the projected color longhands and
 * is the sole interpreter in the production projection path.
 */
export function parseBorderShorthand(value: string, tokenTable: TokenTable): BorderStructure | null {
  const components = parseBorderComponents(value, tokenTable);
  if (!components) return null;
  const colorResult = interpretTokenValue(components.color, { table: tokenTable });
  return {
    kind: "border",
    sourceProperty: "border",
    ...components,
    colorTokenName: colorResult.tokenName,
  };
}
