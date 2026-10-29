import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import type { TokenEntry } from "../../css/model/index.ts";
import { isTokenChange, type TokenChangeRecord } from "../changes/types.ts";
import { useChanges } from "../drafts/store.ts";
import { TextInput } from "../ui/TextInput.tsx";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import { Select } from "../ui/Select.tsx";
import { Disclosure } from "../ui/Disclosure.tsx";
import { TokenValueField } from "./TokenField.tsx";
import {
  TOKEN_GROUP_LABELS,
  TOKEN_GROUP_ORDER,
  aliasName,
  compatibleTokenNames,
  contextLabel,
  filterTokenRows,
  scopeRowsToStylesheet,
  tokenModes,
  tokenStylesheets,
} from "./catalog.ts";
import type { TokenCatalogRow } from "./catalog.ts";
import { setGlobalTokenValue } from "./tokenEdits.ts";
import { TokenLabel } from "./TokenLabel.tsx";

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
  const [chosenStylesheet, setChosenStylesheet] = useState<string | null>(null);
  const [chosenMode, setChosenMode] = useState<string | null>(null);
  const stylesheets = useMemo(() => tokenStylesheets(rows), [rows]);
  const file = stylesheets.length === 0
    ? null
    : stylesheets.find((candidate) => candidate.file === chosenStylesheet)?.file ?? stylesheets[0]!.file;
  const modes = useMemo(() => file === null ? [] : tokenModes(rows, file), [rows, file]);
  // Nothing to choose between with one stylesheet, or with one context in it; otherwise tokens are listed for one at a time.
  const mode = modes.length > 1 ? modes.find((candidate) => candidate.key === chosenMode)?.key ?? modes[0]!.key : null;
  const scopedRows = useMemo(
    () => file === null || (stylesheets.length <= 1 && mode === null) ? rows : scopeRowsToStylesheet(rows, file, mode),
    [rows, file, mode, stylesheets.length],
  );
  const visibleRows = useMemo(() => filterTokenRows(scopedRows, query), [query, scopedRows]);
  const entries: TokenEntry[] = useMemo(() => rows.map((row) => ({
    name: row.definition.cssName,
    value: row.resolvedValue || row.authoredValue,
    source: row.activeDeclaration?.source ?? row.definition.declarations[0]?.source ?? "",
  })), [rows]);

  return (
    <section className="tokens-panel" data-test="tokens-panel">
      <div className="tokens-panel__tools">
        {stylesheets.length > 1 || mode !== null ? (
          <div className="tokens-panel__selects">
            {stylesheets.length > 1 && file !== null ? (
              <Select
                className="tokens-panel__stylesheet"
                value={file}
                options={stylesheets.map((candidate) => ({
                  value: candidate.file,
                  label: `${candidate.file || "Unknown stylesheet"} (${candidate.count})`,
                }))}
                aria-label="Stylesheet"
                data-test="token-stylesheet"
                popupWidth="fit"
                onValueChange={setChosenStylesheet}
              />
            ) : null}
            {mode !== null ? (
              <Select
                className="tokens-panel__mode"
                value={mode}
                options={modes.map((candidate) => ({ value: candidate.key, label: candidate.key }))}
                aria-label="Mode"
                data-test="token-mode"
                popupWidth="fit"
                onValueChange={setChosenMode}
              />
            ) : null}
          </div>
        ) : null}
        <TextInput
          type="search"
          value={query}
          placeholder="Search tokens"
          aria-label="Search tokens"
          data-test="token-search"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {TOKEN_GROUP_ORDER.map((group) => {
        const groupedRows = visibleRows.filter((row) => row.group === group);
        if (groupedRows.length === 0) return null;
        return (
          <section className="token-group" data-test="token-group" data-group={group} key={group}>
            <div className="token-group__heading">
              {TOKEN_GROUP_LABELS[group]}
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
  const tokenName = row.definition.name || row.definition.cssName;

  return (
    <article
      className="token-row"
      data-test="global-token-row"
      data-token-name={row.definition.cssName}
      data-active={row.activeDeclaration ? "true" : "false"}
    >
      <div className="token-row__inline">
        <TokenLabel as="code" className="token-row__name" title={tokenName}>
          {tokenName}
        </TokenLabel>
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
        <Disclosure
          className="token-variants"
          data-test="token-variants"
          title={`Variants (${variants.length})`}
          panelClassName="token-variants__list"
        >
          {variants.map((declaration) => (
            <div className="token-variant" key={`${declaration.source}-${contextLabel(declaration.context)}`}>
              <span className="token-variant__context">{contextLabel(declaration.context)}</span>
              <code>{declaration.value}</code>
              <span>{declaration.source}</span>
            </div>
          ))}
        </Disclosure>
      ) : null}
    </article>
  );
}
