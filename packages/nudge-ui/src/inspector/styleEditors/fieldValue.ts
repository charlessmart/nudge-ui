import type { ResolvedProperty } from "../../css/model/index.ts";
import type { SelectionProperty } from "../inspection/selectionProperty.ts";
import { isCalcExpression } from "../../css/value-semantics/index.ts";

/** True when a row reports a value the inspector must treat as an expression, not as a token: raw CSS, a composite shorthand, an alpha modifier, or an authored color expression such as color-mix(). */
export function isExpressionRow(row: ResolvedProperty | null): boolean {
  return Boolean(row && (row.capability === "raw"
    || row.capability === "composite"
    || row.modifiers?.some((modifier) => modifier.kind === "alpha")
    || row.color?.isExpression));
}

export interface ActiveTokenInput {
  readonly row: ResolvedProperty | null;
  readonly selectedProperty?: SelectionProperty | null;
  /** A multi-element selection that disagrees on this property shows "Mixed" and no chip. */
  readonly mixed: boolean;
  /** The authored CSS value; a calc() expression suppresses the chip. */
  readonly authored?: string;
  /** A property-specific token name that outranks the row (opacity's token-backed value). */
  readonly override?: string | null;
}

/** The token a field should show as active, or null when the value is not token-backed. */
export function deriveActiveTokenName(input: ActiveTokenInput): string | null {
  const { row, selectedProperty, mixed, authored = "", override } = input;
  if (mixed) return null;
  if (override) return override;
  if (isExpressionRow(row) || isCalcExpression(authored)) return null;
  if (selectedProperty) {
    return selectedProperty.token.kind === "common" ? selectedProperty.token.name : null;
  }
  return row?.tokenName ?? null;
}
