import { useMemo } from "react";
import type { ReactElement } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import { getTokenTable } from "./resolution.ts";
import type { ResolvedProperty } from "./resolution.ts";
import { swapToken, promoteToToken } from "./editActions.ts";
import { Select } from "../ui/Select.tsx";
import { classifyToken, getAlternativeTokens } from "./tokenSuggestions.ts";
import type { TokenGroup } from "./tokenSuggestions.ts";

export { classifyToken, getAlternativeTokens, groupOfProperty } from "./tokenSuggestions.ts";
export type { AlternativeTokensOptions, TokenGroup } from "./tokenSuggestions.ts";

const GROUP_LABELS: Record<TokenGroup, string> = {
  color: "Color",
  spacing: "Spacing",
  radius: "Radius",
  typography: "Typography",
  generic: "Other",
};

function groupTokens(entries: TokenEntry[]): Map<TokenGroup, TokenEntry[]> {
  const map = new Map<TokenGroup, TokenEntry[]>();
  for (const entry of entries) {
    const group = classifyToken(entry.name, entry.value);
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
