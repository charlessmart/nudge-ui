import type { ResolvedProperty } from "@nudge-ui/css/model";

/** Finds the resolved row for one CSS property, or null when it is absent. */
export function findTokenRow(
  rows: readonly ResolvedProperty[],
  property: string,
): ResolvedProperty | null {
  return rows.find((row) => row.property === property) ?? null;
}

/**
 * Source provenance for an edit, taken from the row that produced it. Omitted
 * when the row carries no authored origin, so the caller sends no metadata.
 */
export function metadataFor(row: ResolvedProperty | null | undefined) {
  return row?.sourceProperty
    ? { sourceProperty: row.sourceProperty, sourceAuthoredValue: row.authored ?? row.declaredValue }
    : undefined;
}
