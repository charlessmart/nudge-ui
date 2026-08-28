import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import { isTokenChange, useChanges } from "../changesLog.ts";
import type { TokenChangeRecord } from "../changesLog.ts";
import { TextInput } from "../ui/TextInput.tsx";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import { TokenValueField } from "./TokenField.tsx";
import {
  TOKEN_GROUP_LABELS,
  TOKEN_GROUP_ORDER,
  aliasName,
  compatibleTokenNames,
  contextLabel,
  filterTokenRows,
} from "./catalog.ts";
import type { TokenCatalogRow } from "./catalog.ts";
import { setGlobalTokenValue } from "./tokenEdits.ts";

function rowChange(
  row: TokenCatalogRow,
  changes: ReturnType<typeof useChanges>,
): TokenChangeRecord | undefined {
  return changes.find((change): change is TokenChangeRecord =>
    isTokenChange(change)
    && change.tokenName === row.definition.cssName
    && change.file === row.file
    && change.line === row.line);
}

export function TokensPanel({ rows }: { rows: readonly TokenCatalogRow[] }): ReactElement {
  const [query, setQuery] = useState("");
  const visibleRows = useMemo(() => filterTokenRows(rows, query), [query, rows]);
  const entries: TokenEntry[] = useMemo(() => rows.map((row) => ({
    name: row.definition.cssName,
    value: row.resolvedValue || row.authoredValue,
    source: row.activeDeclaration?.source ?? row.definition.declarations[0]?.source ?? "",
  })), [rows]);

  return (
    <section className="tokens-panel" data-test="tokens-panel">
      <div className="tokens-panel__tools">
        <TextInput
          type="search"
          value={query}
          placeholder="Search tokens"
          aria-label="Search tokens"
          data-test="token-search"
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="tokens-panel__count" data-test="token-count">
          {visibleRows.length} {visibleRows.length === 1 ? "token" : "tokens"}
        </span>
      </div>

      {TOKEN_GROUP_ORDER.map((group) => {
        const groupedRows = visibleRows.filter((row) => row.group === group);
        if (groupedRows.length === 0) return null;
        return (
          <section className="token-group" data-test="token-group" data-group={group} key={group}>
            <div className="token-group__heading">
              <span>{TOKEN_GROUP_LABELS[group]}</span>
              <span>{groupedRows.length}</span>
            </div>
            {groupedRows.map((row) => (
              <TokenCatalogItem key={row.definition.cssName} row={row} rows={rows} entries={entries} />
            ))}
          </section>
        );
      })}

      {visibleRows.length === 0 ? (
        <div className="tokens-panel__empty" data-test="tokens-empty">No matching tokens</div>
      ) : null}
    </section>
  );
}

function TokenCatalogItem({
  row,
  rows,
  entries,
}: {
  row: TokenCatalogRow;
  rows: readonly TokenCatalogRow[];
  entries: TokenEntry[];
}): ReactElement {
  const changes = useChanges();
  const activeChange = rowChange(row, changes);
  const committedValue = activeChange?.rawValue ?? row.authoredValue;
  const activeAlias = aliasName(committedValue);
  const effectiveRows = rows.map((candidate) => ({
    ...candidate,
    authoredValue: rowChange(candidate, changes)?.rawValue ?? candidate.authoredValue,
  }));
  const effectiveRow = effectiveRows.find((candidate) =>
    candidate.definition.cssName === row.definition.cssName
    && candidate.file === row.file
    && candidate.line === row.line,
  ) ?? row;
  const allowed = compatibleTokenNames(effectiveRow, effectiveRows);
  const variants = row.definition.declarations.filter((declaration) => declaration !== row.activeDeclaration);

  return (
    <article
      className="token-row"
      data-test="global-token-row"
      data-token-name={row.definition.cssName}
      data-active={row.activeDeclaration ? "true" : "false"}
    >
      <div className="token-row__inline">
        <code className="token-row__name">{row.definition.name || row.definition.cssName}</code>
        {row.activeDeclaration ? (
          <ControlSurface>
            <TokenValueField
              property={row.definition.cssName}
              committedValue={committedValue}
              resolvedValue={row.resolvedValue || committedValue}
              activeTokenName={activeAlias}
              entries={entries}
              allowedTokenNames={allowed}
              isColor={row.group === "color"}
              onCommitRaw={(value) => setGlobalTokenValue(row, value)}
              onSelectToken={(token) => { setGlobalTokenValue(row, `var(${token.name})`); }}
              onUnlink={(value) => setGlobalTokenValue(row, value)}
            />
          </ControlSurface>
        ) : (
          <TextInput disabled value="Inactive in current theme" aria-label={`${row.definition.cssName} inactive`} />
        )}
      </div>

      {variants.length > 0 ? (
        <details className="token-variants" data-test="token-variants">
          <summary>Variants ({variants.length})</summary>
          <div className="token-variants__list">
            {variants.map((declaration) => (
              <div className="token-variant" key={`${declaration.source}-${contextLabel(declaration.context)}`}>
                <span className="token-variant__context">{contextLabel(declaration.context)}</span>
                <code>{declaration.value}</code>
                <span>{declaration.source}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </article>
  );
}
