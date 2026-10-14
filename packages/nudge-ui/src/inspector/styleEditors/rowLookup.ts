import type { ResolvedProperty } from "../../css/model/index.ts";

export function findTokenRow(
  rows: readonly ResolvedProperty[],
  property: string,
): ResolvedProperty | null {
  return rows.find((row) => row.property === property) ?? null;
}

/** Undefined when the row has no authored origin, so callers send no metadata. */
export function metadataFor(row: ResolvedProperty | null | undefined) {
  return row?.sourceProperty
    ? { sourceProperty: row.sourceProperty, sourceAuthoredValue: row.authored ?? row.declaredValue }
    : undefined;
}
