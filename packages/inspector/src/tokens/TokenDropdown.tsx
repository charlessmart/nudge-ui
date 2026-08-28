import { useMemo } from "react";
import type { ReactElement } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "@nudge-ui/css/model";
import { swapToken, promoteToToken } from "./editActions.ts";
import { Select } from "../ui/Select.tsx";
import {
  selectTokens,
  TOKEN_GROUP_LABELS,
  TOKEN_GROUP_ORDER,
} from "@nudge-ui/css/value-semantics";
import type {
  CssValueGrammar,
  TokenCandidate,
  TokenGroup,
  TokenSemanticSlot,
} from "@nudge-ui/css/value-semantics";

function groupTokens(entries: TokenCandidate[]): Map<TokenGroup, TokenCandidate[]> {
  const map = new Map<TokenGroup, TokenCandidate[]>();
  for (const entry of entries) {
    const group = entry.group;
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
  slot?: TokenSemanticSlot;
  grammar?: CssValueGrammar;
  onAfterEdit?: () => void;
}

export function TokenDropdown(props: TokenDropdownProps): ReactElement {
  const { row, domElement, entries, slot, grammar, onAfterEdit } = props;

  const candidates = useMemo(
    () => selectTokens({
      element: domElement,
      property: row.property,
      slot,
      entries,
      currentToken: row.tokenName,
      grammar,
    }).candidates,
    [domElement, entries, grammar, row.property, row.tokenName, slot],
  );

  const grouped = useMemo(() => groupTokens(candidates), [candidates]);

  function handleSelect(value: string): void {
    const chosen = candidates.find(({ entry }) => entry.name === value)?.entry;
    if (!chosen) return;
    const oldToken = row.tokenName
      ? entries.find((entry) => entry.name === row.tokenName || entry.cssName === row.tokenName) ?? null
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
  const selectGroups = TOKEN_GROUP_ORDER.flatMap((group) => {
    const list = grouped.get(group);
    if (!list || list.length === 0) return [];
    return [{
      label: TOKEN_GROUP_LABELS[group],
      options: list.map(({ entry }) => ({ value: entry.name, label: entry.name })),
    }];
  });

  return (
    <span className="token-dropdown" data-test="token-dropdown">
      {hasToken ? (
        <Select
          data-test="token-select"
          value={selectValue}
          groups={selectGroups}
          searchable
          searchPlaceholder="Search"
          searchAriaLabel="Search tokens"
          onValueChange={handleSelect}
        />
      ) : (
        <span className="token-promote" data-test="token-promote">
          <Select
            data-test="token-promote-select"
            value=""
            placeholder="Replace with token…"
            groups={selectGroups}
            searchable
            searchPlaceholder="Search"
            searchAriaLabel="Search tokens"
            onValueChange={handlePromote}
          />
        </span>
      )}
    </span>
  );
}
