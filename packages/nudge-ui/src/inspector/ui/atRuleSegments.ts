import type { AtRuleCandidate, AtRuleContext, AtRuleKind } from "../../css/model/index.ts";

export interface AtRuleSegment {
  key: string;
  /** The unconditional declaration is the base segment; every conditional rule adds one more. */
  kind: AtRuleKind | "base";
  params: string | null;
  active: boolean;
}

const WIDTH_BOUND = /\b(max|min)-width\s*:\s*(-?\d*\.?\d+)\s*(px|em|rem)\b|\bwidth\s*(<=?|>=?)\s*(-?\d*\.?\d+)\s*(px|em|rem)\b/i;

function pixels(value: string, unit: string): number {
  const amount = Number.parseFloat(value);
  return unit.toLowerCase() === "px" ? amount : amount * 16;
}

/** The first viewport-width bound in a media prelude, as a direction and a pixel size. */
function widthBound(params: string): { direction: "max" | "min"; size: number } | null {
  const match = WIDTH_BOUND.exec(params);
  if (!match) return null;
  if (match[1]) return { direction: match[1].toLowerCase() === "max" ? "max" : "min", size: pixels(match[2]!, match[3]!) };
  return { direction: match[4]!.startsWith("<") ? "max" : "min", size: pixels(match[5]!, match[6]!) };
}

/**
 * Segments ordered like a ruler from the largest viewport down. A base declaration sits at the
 * large end when the conditions are max-width (desktop first) and at the small end for min-width.
 */
export function atRuleSegments(atRules: readonly (AtRuleContext | AtRuleCandidate)[]): AtRuleSegment[] {
  const conditional = atRules.map((atRule, index): AtRuleSegment & { size: number | null } => ({
    key: `${atRule.kind}-${atRule.params}-${index}`,
    kind: atRule.kind,
    params: atRule.params,
    active: !("active" in atRule) || atRule.active,
    size: atRule.kind === "media" ? widthBound(atRule.params)?.size ?? null : null,
  }));
  const bounds = atRules.flatMap((atRule) => atRule.kind === "media" ? [widthBound(atRule.params)] : []);
  const mobileFirst = bounds.some((bound) => bound?.direction === "min") && !bounds.some((bound) => bound?.direction === "max");
  const base = { key: "base", kind: "base" as const, params: null, active: !conditional.some((segment) => segment.active), size: mobileFirst ? 0 : Number.POSITIVE_INFINITY };
  const measured = [base, ...conditional].filter((segment) => segment.size !== null)
    .sort((left, right) => (right.size as number) - (left.size as number));
  const unmeasured = conditional.filter((segment) => segment.size === null);
  return [...measured, ...unmeasured].map(({ size: _size, ...segment }) => segment);
}
