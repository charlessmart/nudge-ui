import type { TokenEntry } from "virtual:design-tokens";

export type TokenGroup = "color" | "spacing" | "radius" | "typography" | "generic";

export function classifyToken(name: string, value = ""): TokenGroup {
  if (name.startsWith("--color-")) return "color";
  if (name.startsWith("--space-")) return "spacing";
  if (name.startsWith("--radius-")) return "radius";
  if (name.startsWith("--font-") || name.startsWith("--text-") || name.startsWith("--type-")
    || name.startsWith("--leading-") || name.startsWith("--tracking-")) return "typography";
  const humanPath = name.toLowerCase();
  if (/(^|\.)(color|colors|surface|background|foreground)(\.|$)/.test(humanPath) || /^(?:#|rgb\(|hsl\(|oklch\(|oklab\(|transparent)/i.test(value.trim())) return "color";
  if (/(^|\.)(space|spacing|size|gap)(\.|$)/.test(humanPath)) return "spacing";
  if (/(^|\.)(font|typography|lineheight|letterspacing)(\.|$)/.test(humanPath)) return "typography";
  return "generic";
}

export function groupOfProperty(property: string): TokenGroup {
  const p = property.toLowerCase();
  if (
    p === "background" ||
    p === "background-color" ||
    p === "color" ||
    p === "border-color" ||
    p === "border-top-color" ||
    p === "border-right-color" ||
    p === "border-bottom-color" ||
    p === "border-left-color" ||
    p === "outline-color" ||
    p === "fill" ||
    p === "stroke" ||
    p === "box-shadow"
  ) {
    return "color";
  }
  if (p === "border-radius") return "radius";
  if (
    p === "font-size" ||
    p === "font-weight" ||
    p === "font-family" ||
    p === "line-height" ||
    p === "letter-spacing" ||
    p === "text-align"
  ) {
    return "typography";
  }
  if (
    p === "padding" ||
    p === "margin" ||
    p.startsWith("padding-") ||
    p.startsWith("margin-") ||
    p === "gap" ||
    p === "row-gap" ||
    p === "column-gap" ||
    p.startsWith("border-") && p.endsWith("-width") ||
    p === "border-spacing" ||
    p === "width" ||
    p === "height" ||
    p === "min-width" ||
    p === "max-width" ||
    p === "min-height" ||
    p === "max-height" ||
    p === "top" ||
    p === "right" ||
    p === "bottom" ||
    p === "left"
  ) {
    return "spacing";
  }
  return "generic";
}

export interface AlternativeTokensOptions {
  property: string;
  currentToken: string | null;
}

export function getAlternativeTokens(
  entries: TokenEntry[],
  opts: AlternativeTokensOptions,
): TokenEntry[] {
  const preferredGroup = groupOfProperty(opts.property);
  return entries.filter((entry) => {
    const group = classifyToken(entry.name, entry.value);
    return group === preferredGroup || entry.name === opts.currentToken;
  });
}
