import { useMemo } from "react";
import type { ReactElement } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import { getTokenTable } from "./resolution.ts";
import type { ResolvedProperty } from "./resolution.ts";
import { swapToken, promoteToToken } from "./editActions.ts";
import { Select } from "../ui/Select.tsx";

export type TokenGroup = "color" | "spacing" | "radius" | "typography" | "generic";

export function classifyToken(name: string): TokenGroup {
  if (name.startsWith("--color-")) return "color";
  if (name.startsWith("--space-")) return "spacing";
  if (name.startsWith("--radius-")) return "radius";
  if (name.startsWith("--font-") || name.startsWith("--text-")) return "typography";
  return "generic";
}

const GROUP_LABELS: Record<TokenGroup, string> = {
  color: "Color",
  spacing: "Spacing",
  radius: "Radius",
  typography: "Typography",
  generic: "Other",
};

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
    const group = classifyToken(entry.name);
    return group === preferredGroup || entry.name === opts.currentToken;
  });
}

function groupTokens(entries: TokenEntry[]): Map<TokenGroup, TokenEntry[]> {
  const map = new Map<TokenGroup, TokenEntry[]>();
  for (const entry of entries) {
    const group = classifyToken(entry.name);
    let list = map.get(group);
    if (!list) {
      list = [];
      map.set(group, list);
    }
    list.push(entry);
  }
  return map;
}

export interface TokenDropdownProps {
  row: ResolvedProperty;
  domElement: HTMLElement;
  entries: TokenEntry[];
  onAfterEdit?: () => void;
}

export function TokenDropdown(props: TokenDropdownProps): ReactElement {
  const { row, domElement, entries, onAfterEdit } = props;

  const alternatives = useMemo(
    () => getAlternativeTokens(entries, { property: row.property, currentToken: row.tokenName }),
    [entries, row.property, row.tokenName],
  );

  const grouped = useMemo(() => groupTokens(alternatives), [alternatives]);
  const orderedGroups: TokenGroup[] = ["color", "spacing", "radius", "typography", "generic"];

  function handleSelect(value: string): void {
    const chosen = alternatives.find((entry) => entry.name === value);
    if (!chosen) return;
    const oldToken = row.tokenName
      ? (getTokenTable()[row.tokenName] ?? null)
      : null;
    swapToken(domElement, row.property, chosen, oldToken);
    onAfterEdit?.();
  }

  function handlePromote(value: string): void {
    const chosen = entries.find((entry) => entry.name === value);
    if (!chosen) return;
    promoteToToken(domElement, row.property, chosen);
    onAfterEdit?.();
  }

  const hasToken = row.tokenName !== null;
  const selectValue = row.tokenName ?? "";
  const selectGroups = orderedGroups.flatMap((group) => {
    const list = grouped.get(group);
    if (!list || list.length === 0) return [];
    return [{
      label: GROUP_LABELS[group],
      options: list.map((entry) => ({ value: entry.name, label: entry.name })),
    }];
  });

  return (
    <span className="dt-token-dropdown" data-test="token-dropdown">
      {hasToken ? (
        <Select
          data-test="token-select"
          value={selectValue}
          groups={selectGroups}
          onValueChange={handleSelect}
        />
      ) : (
        <span className="dt-token-promote" data-test="token-promote">
          <Select
            data-test="token-promote-select"
            value=""
            placeholder="Replace with token…"
            groups={selectGroups}
            onValueChange={handlePromote}
          />
        </span>
      )}
    </span>
  );
}
