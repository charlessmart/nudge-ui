import type { ResolvedProperty } from "@nudge-ui/css/model";

export type AggregateValueState = "common" | "mixed";
export type AggregateTokenState = "none" | "common" | "mixed";

export interface AggregatedProperty extends ResolvedProperty {
  aggregate: {
    valueState: AggregateValueState;
    tokenState: AggregateTokenState;
    values: readonly string[];
    tokenNames: readonly (string | null)[];
    rows: readonly ResolvedProperty[];
    targetRows?: readonly (ResolvedProperty | null)[];
  };
}

export interface PropertySnapshot {
  properties: readonly ResolvedProperty[];
}

export function isAggregatedProperty(
  row: ResolvedProperty | null | undefined,
): row is AggregatedProperty {
  return Boolean(row && "aggregate" in row);
}

function effectiveValue(row: ResolvedProperty): string {
  return (row.resolvedValue || row.declaredValue || row.authored || "").trim();
}

function sameValues(values: readonly string[]): boolean {
  const first = values[0];
  return first !== undefined && values.every((value) => value === first);
}

function tokenStateForRows(rows: readonly (ResolvedProperty | null)[]): AggregateTokenState {
  const names = rows.map((row) => row?.tokenName ?? null);
  if (names.every((name) => name === null)) return "none";
  const first = names[0];
  return first && names.every((name) => name === first) ? "common" : "mixed";
}

function aggregateRow(
  property: string,
  targetRows: readonly (ResolvedProperty | null)[],
  values: readonly string[],
): AggregatedProperty {
  const rows = targetRows.filter(
    (row): row is ResolvedProperty => row !== null,
  );
  const firstRow = rows[0];
  const normalizedValues = values.map((value) => value.trim());
  const valueState: AggregateValueState = sameValues(normalizedValues) ? "common" : "mixed";
  const aggregateTokenState = tokenStateForRows(targetRows);
  const common = valueState === "common";
  const commonSource = aggregateTokenState === "common";
  const value = normalizedValues[0] ?? "";
  const primary: ResolvedProperty = firstRow ?? {
    property,
    tokenName: null,
    declaredValue: value,
    resolvedValue: value,
    authored: value,
    computed: value,
    confidence: "unknown",
    evidence: { reason: "computed value used for group editing" },
  };
  const row: AggregatedProperty = {
    ...primary,
    property,
    ...(commonSource ? {} : {
      tokenName: null,
      tokens: undefined,
      sourceProperty: undefined,
    }),
    ...(common ? {} : {
      tokenName: null,
      tokens: undefined,
      declaredValue: "Mixed",
      resolvedValue: "Mixed",
      authored: "Mixed",
      computed: "Mixed",
      opacity: undefined,
      propertyOpacity: undefined,
      structure: undefined,
    }),
    ...(common && !commonSource ? {
      declaredValue: value,
      resolvedValue: value,
      authored: value,
      computed: value,
    } : {}),
    aggregate: {
      valueState,
      tokenState: aggregateTokenState,
      values: normalizedValues,
      tokenNames: targetRows.map((candidate) => candidate?.tokenName ?? null),
      rows,
      targetRows,
    },
  };
  return row;
}

/**
 * Aggregates one property even when some targets have no authored row.
 * Callers provide the browser-computed value for every target so defaults and
 * inherited values remain editable as a group.
 */
export function aggregatePropertyValues(
  property: string,
  snapshots: readonly PropertySnapshot[],
  values: readonly string[],
): AggregatedProperty | null {
  if (snapshots.length === 0 || values.length !== snapshots.length) return null;
  const targetRows = snapshots.map((snapshot) =>
    snapshot.properties.find((candidate) => candidate.property === property) ?? null);
  return aggregateRow(property, targetRows, values);
}

/**
 * Aligns the properties present on every inspected target. The returned row
 * keeps the primary target's attribution metadata for existing single-target
 * editors, while aggregate facts make mixed values and token provenance
 * explicit to group-aware editors.
 */
export function aggregateProperties(
  snapshots: readonly PropertySnapshot[],
): AggregatedProperty[] {
  const first = snapshots[0];
  if (!first || snapshots.length === 0) return [];

  const rows: AggregatedProperty[] = [];
  for (const primaryRow of first.properties) {
    const matchingRows = snapshots.map((snapshot) =>
      snapshot.properties.find((candidate) => candidate.property === primaryRow.property));
    if (matchingRows.some((row) => row === undefined)) continue;
    const resolvedRows = matchingRows.map((row) => row ?? null);
    const values = resolvedRows.map((row) => row ? effectiveValue(row) : "");
    rows.push(aggregateRow(primaryRow.property, resolvedRows, values));
  }
  return rows;
}

/** Returns the token entries available to every inspected target. */
export function intersectTokenEntries<T extends { name: string; value: string }>(
  entries: readonly (readonly T[])[],
): T[] {
  const first = entries[0];
  if (!first || entries.length === 0) return [];
  return first.filter((entry) => entries.every((candidateEntries) =>
    candidateEntries.some((candidate) => candidate.name === entry.name && candidate.value === entry.value)));
}

/** Returns only interaction states supported by every inspected target. */
export function intersectValues<T>(values: readonly (readonly T[])[]): T[] {
  const first = values[0];
  if (!first || values.length === 0) return [];
  return first.filter((value) => values.every((candidateValues) => candidateValues.includes(value)));
}
