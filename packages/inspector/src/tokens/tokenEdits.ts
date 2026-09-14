import { appendChange } from "../changes/changesLog.ts";
import type { TokenChangeRecord } from "../changes/changesLog.ts";
import type { TokenCatalogRow } from "./catalog.ts";

export function setGlobalTokenValue(row: TokenCatalogRow, value: string): TokenChangeRecord | null {
  const nextValue = value.trim();
  if (!row.activeDeclaration || !nextValue) return null;

  const record: TokenChangeRecord = {
    kind: "token",
    tokenName: row.definition.cssName,
    file: row.file,
    line: row.line,
    selector: row.selector,
    property: row.definition.cssName,
    rawValue: nextValue,
    oldRawValue: row.authoredValue,
    important: row.activeDeclaration.important,
    context: row.styleContext,
    contextLabel: row.contextLabel,
    source: { file: row.file, line: row.line, component: "Global token" },
  };
  appendChange(record);
  return record;
}
