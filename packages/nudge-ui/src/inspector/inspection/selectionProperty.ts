import type { ResolvedProperty } from "../../css/model/index.ts";

export type SelectionValue =
  | { kind: "common"; value: string }
  | { kind: "mixed" };

export type SelectionToken =
  | { kind: "none" }
  | { kind: "common"; name: string }
  | { kind: "mixed" };

export interface SelectionProperty {
  property: string;
  value: SelectionValue;
  token: SelectionToken;
  primaryRow: ResolvedProperty | null;
  rows: readonly (ResolvedProperty | null)[];
}

function tokenFor(rows: readonly (ResolvedProperty | null)[]): SelectionToken {
  const names = rows.map((row) => row?.tokenName ?? null);
  if (names.every((name) => name === null)) return { kind: "none" };
  const first = names[0];
  return first && names.every((name) => name === first)
    ? { kind: "common", name: first }
    : { kind: "mixed" };
}

/** The result cannot masquerade as an authored CSS row. */
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
    rows,
  };
}

export function intersectTokenEntries<T extends { name: string; value: string }>(
  entries: readonly (readonly T[])[],
): T[] {
  const first = entries[0];
  if (!first) return [];
  if (entries.length === 1) return [...first];
  // Pages with thousands of custom properties made the nested scan quadratic for every selection.
  const keys = (list: readonly T[]): Set<string> => new Set(list.map((entry) => `${entry.name}\u0000${entry.value}`));
  const others = entries.slice(1).map(keys);
  return first.filter((entry) => {
    const key = `${entry.name}\u0000${entry.value}`;
    return others.every((candidateKeys) => candidateKeys.has(key));
  });
}
