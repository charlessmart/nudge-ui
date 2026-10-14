import type { ResolvedProperty } from "../../css/model/index.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";

export function hasAuthoredProperty(
  selection: StyleSelection | null | undefined,
  property: string,
  row?: ResolvedProperty | null,
): boolean {
  return selection
    ? selection.getProperty(property)?.rows.some(hasAuthoredStyle) ?? false
    : hasAuthoredStyle(row);
}

export function isZeroCssValue(value: string): boolean {
  return /^[+-]?(?:0+(?:\.0*)?|\.0+)(?:[a-z%]+)?$/i.test(value.trim());
}

export function hasAuthoredStyle(row: ResolvedProperty | null | undefined): boolean {
  if (!row || row.evidence.inheritedFrom) return false;
  const value = (row.authored ?? row.declaredValue).trim();
  if (!value) return false;
  // Neutral literals from Preflight-style blanket rules (`* { padding: 0 }`) are not authored styles.
  const blanketRule = row.evidence.selector?.split(",").every((selector) =>
    /^(?:\*|\*?::?(?:before|after|backdrop))$/.test(selector.trim()));
  const neutral = value.split(/\s+/).every((part) =>
    isZeroCssValue(part) || ["none", "solid", "transparent", "currentcolor"].includes(part.toLowerCase()));
  return !blanketRule || !neutral;
}
