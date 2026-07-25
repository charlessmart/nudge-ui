import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import { tokenCatalog } from "virtual:design-tokens";
import { isTokenChange, useChanges } from "../changesLog.ts";
import { TextInput } from "../ui/TextInput.tsx";
import { TokenValueField } from "./TokenField.tsx";
import {
  TOKEN_GROUP_LABELS,
  TOKEN_GROUP_ORDER,
  aliasName,
  buildTokenCatalogRows,
  compatibleTokenNames,
  contextLabel,
  filterTokenRows,
} from "./catalog.ts";
import type { TokenCatalogRow } from "./catalog.ts";
import { setGlobalTokenValue } from "./tokenEdits.ts";
import { getAvailableTokenCatalog } from "./resolution.ts";

function useHostContextRevision(): number {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, { attributes: true });
    observer.observe(document.head, { attributes: true, childList: true, subtree: true });

    const media = [...new Set(tokenCatalog.flatMap((definition) =>
      definition.declarations.flatMap((declaration) =>
        (declaration.context.wrappers ?? [])
          .filter((wrapper) => wrapper.kind === "media")
          .map((wrapper) => wrapper.params)),
    ))];
    const queries = typeof window.matchMedia === "function"
      ? media.map((query) => window.matchMedia(query))
      : [];
    queries.forEach((query) => query.addEventListener?.("change", refresh));
    return () => {
      observer.disconnect();
      queries.forEach((query) => query.removeEventListener?.("change", refresh));
    };
  }, []);

  return revision;
}

function rowChange(row: TokenCatalogRow, changes: ReturnType<typeof useChanges>) {
  return changes.find((change) => isTokenChange(change)
    && change.tokenName === row.definition.cssName
    && change.file === row.file
    && change.line === row.line);
}

export function TokensPanel(): ReactElement {
  const [query, setQuery] = useState("");
  const revision = useHostContextRevision();
  const changes = useChanges();
  const rows = useMemo(
    () => buildTokenCatalogRows(getAvailableTokenCatalog()),
    [revision, changes],
  );
  const visibleRows = useMemo(() => filterTokenRows(rows, query), [query, rows]);
  const entries: TokenEntry[] = useMemo(() => rows.map((row) => ({
    name: row.definition.cssName,
    value: row.resolvedValue || row.authoredValue,
    source: row.activeDeclaration?.source ?? row.definition.declarations[0]?.source ?? "",
  })), [rows]);

  return (
    <section className="dt-tokens-panel" data-test="tokens-panel">
      <div className="dt-tokens-panel__tools">
        <TextInput
          type="search"
          value={query}
          placeholder="Search tokens"
          aria-label="Search tokens"
          data-test="token-search"
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="dt-tokens-panel__count" data-test="token-count">
          {visibleRows.length} {visibleRows.length === 1 ? "token" : "tokens"}
        </span>
      </div>

      {TOKEN_GROUP_ORDER.map((group) => {
        const groupedRows = visibleRows.filter((row) => row.group === group);
        if (groupedRows.length === 0) return null;
        return (
          <section className="dt-token-group" data-test="token-group" data-group={group} key={group}>
            <div className="dt-token-group__heading">
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
        <div className="dt-tokens-panel__empty" data-test="tokens-empty">No matching tokens</div>
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
  rows: TokenCatalogRow[];
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
      className="dt-token-row"
      data-test="global-token-row"
      data-token-name={row.definition.cssName}
      data-active={row.activeDeclaration ? "true" : "false"}
    >
      <div className="dt-token-row__inline">
        <code className="dt-token-row__name">{row.definition.name || row.definition.cssName}</code>
        {row.activeDeclaration ? (
          <TokenValueField
            property={row.definition.cssName}
            committedValue={committedValue}
            resolvedValue={row.resolvedValue || committedValue}
            activeTokenName={activeAlias}
            entries={entries}
            allowedTokenNames={allowed}
            isColor={row.group === "color"}
            onCommitRaw={(value) => setGlobalTokenValue(row, value)}
            onSelectToken={(token) => setGlobalTokenValue(row, `var(${token.name})`)}
            onUnlink={(value) => setGlobalTokenValue(row, value)}
          />
        ) : (
          <TextInput disabled value="Inactive in current theme" aria-label={`${row.definition.cssName} inactive`} />
        )}
      </div>

      {variants.length > 0 ? (
        <details className="dt-token-variants" data-test="token-variants">
          <summary>Variants ({variants.length})</summary>
          <div className="dt-token-variants__list">
            {variants.map((declaration) => (
              <div className="dt-token-variant" key={`${declaration.source}-${contextLabel(declaration.context)}`}>
                <span className="dt-token-variant__context">{contextLabel(declaration.context)}</span>
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
