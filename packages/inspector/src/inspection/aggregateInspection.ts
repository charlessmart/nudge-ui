import type { ResolvedProperty } from "@nudge-ui/css/model";

export type AggregateValueState = "common" | "mixed";
export type AggregateSourceState = "none" | "common" | "mixed";

export interface AggregatedProperty extends ResolvedProperty {
  aggregate: {
    valueState: AggregateValueState;
    sourceState: AggregateSourceState;
    values: readonly string[];
    tokenNames: readonly (string | null)[];
    rows: readonly ResolvedProperty[];
  };
}

export interface PropertySnapshot {
  properties: readonly ResolvedProperty[];
}

function effectiveValue(row: ResolvedProperty): string {
  return (row.resolvedValue || row.declaredValue || row.authored || "").trim();
}

function sameValues(values: readonly string[]): boolean {
  const first = values[0];
  return first !== undefined && values.every((value) => value === first);
}

function commonTokenName(rows: readonly ResolvedProperty[]): string | null {
  const names = rows.map((row) => row.tokenName);
  const first = names[0];
  return first && names.every((name) => name === first) ? first : null;
}

function sourceState(rows: readonly ResolvedProperty[]): AggregateSourceState {
  const names = rows.map((row) => row.tokenName);
  if (names.every((name) => name === null)) return "none";
  return commonTokenName(rows) ? "common" : "mixed";
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
    const resolvedRows = matchingRows.filter(
      (row): row is ResolvedProperty => row !== undefined,
    );
    if (resolvedRows.length !== snapshots.length) continue;
    const values = resolvedRows.map(effectiveValue);
    const valueState: AggregateValueState = sameValues(values) ? "common" : "mixed";
    const aggregateSourceState = sourceState(resolvedRows);
    const value = values[0] ?? "";
    const common = valueState === "common";
    const commonSource = aggregateSourceState === "common";
    const primary = resolvedRows[0]!;
    const row: AggregatedProperty = {
      ...primary,
      ...(commonSource ? {} : {
        tokenName: null,
        tokens: undefined,
      }),
      ...(common ? {} : {
        tokenName: null,
        tokens: undefined,
        declaredValue: "Mixed",
        resolvedValue: "Mixed",
        authored: "Mixed",
        opacity: undefined,
        propertyOpacity: undefined,
        structure: undefined,
      }),
      ...(common && !commonSource ? {
        declaredValue: value,
        resolvedValue: value,
        authored: value,
      } : {}),
      aggregate: {
        valueState,
        sourceState: aggregateSourceState,
        values,
        tokenNames: resolvedRows.map((candidate) => candidate.tokenName),
        rows: resolvedRows,
      },
    };
    rows.push(row);
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
