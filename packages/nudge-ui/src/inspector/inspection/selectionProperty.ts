import type { ResolvedProperty } from "../../css/model/index.ts";

export type SelectionValue =
  | { kind: "common"; value: string }
  | { kind: "mixed" };

export type SelectionToken =
  | { kind: "none" }
  | { kind: "common"; name: string }
  | { kind: "mixed" };

/** One CSS property projected across every element in the current selection. */
export interface SelectionProperty {
  property: string;
  value: SelectionValue;
  token: SelectionToken;
  primaryRow: ResolvedProperty | null;
}

function tokenFor(rows: readonly (ResolvedProperty | null)[]): SelectionToken {
  const names = rows.map((row) => row?.tokenName ?? null);
  if (names.every((name) => name === null)) return { kind: "none" };
  const first = names[0];
  return first && names.every((name) => name === first)
    ? { kind: "common", name: first }
    : { kind: "mixed" };
}

/**
 * Projects browser values and authored inspection rows into group-safe facts.
 * The returned type cannot masquerade as an authored CSS row.
 */
export function projectSelectionProperty(
  property: string,
  rows: readonly (ResolvedProperty | null)[],
  values: readonly string[],
  primaryIndex: number,
): SelectionProperty | null {
  if (values.length === 0 || rows.length !== values.length) return null;
  const normalizedValues = values.map((value) => value.trim());
  const first = normalizedValues[0] ?? "";
  const common = normalizedValues.every((value) => value === first);
  return {
    property,
    value: common ? { kind: "common", value: first } : { kind: "mixed" },
    token: tokenFor(rows),
    primaryRow: rows[primaryIndex] ?? null,
  };
}

/** Returns the token entries available to every inspected target. */
export function intersectTokenEntries<T extends { name: string; value: string }>(
  entries: readonly (readonly T[])[],
): T[] {
  const first = entries[0];
  if (!first) return [];
  return first.filter((entry) => entries.every((candidateEntries) =>
    candidateEntries.some((candidate) => candidate.name === entry.name && candidate.value === entry.value)));
}
