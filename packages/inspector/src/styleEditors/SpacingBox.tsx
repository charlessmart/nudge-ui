import type { ReactElement } from "react";
import type { ResolvedProperty } from "../tokens/resolution.ts";
import { TokenField } from "../tokens/TokenField.tsx";
import type { TokenEntry } from "virtual:design-tokens";
import type { SelectedElement } from "../selectionStore.ts";

function findTokenRow(rows: ResolvedProperty[], prop: string): ResolvedProperty | null {
  return rows.find((r) => r.property === prop) ?? null;
}

function findSpacingTokenRow(
  rows: ResolvedProperty[],
  side: string,
  shorthand: string,
): ResolvedProperty | null {
  return findTokenRow(rows, side) ?? findTokenRow(rows, shorthand);
}

export interface SpacingBoxProps {
  element: SelectedElement;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  onAfterEdit?: () => void;
}

export function SpacingBox(props: SpacingBoxProps): ReactElement {
  const { element, entries, tokenRows = [], onAfterEdit } = props;
  const el = element.domElement;
  const allEntries = entries ?? [];

  return (
    <div className="dt-editor" data-test="spacing-box">
      <div className="dt-editor__title">Spacing</div>
      <div className="dt-spacing">
        <div className="dt-spacing__group" data-test="spacing-padding">
          <div className="dt-spacing__label">padding</div>
          <SpacingField
            kind="top"
            property="padding-top"
            shorthand="padding"
            domElement={el}
            entries={allEntries}
            tokenRows={tokenRows}
            onAfterEdit={onAfterEdit}
          />
          <SpacingField
            kind="right"
            property="padding-right"
            shorthand="padding"
            domElement={el}
            entries={allEntries}
            tokenRows={tokenRows}
            onAfterEdit={onAfterEdit}
          />
          <SpacingField
            kind="bottom"
            property="padding-bottom"
            shorthand="padding"
            domElement={el}
            entries={allEntries}
            tokenRows={tokenRows}
            onAfterEdit={onAfterEdit}
          />
          <SpacingField
            kind="left"
            property="padding-left"
            shorthand="padding"
            domElement={el}
            entries={allEntries}
            tokenRows={tokenRows}
            onAfterEdit={onAfterEdit}
          />
        </div>
        <div className="dt-spacing__group" data-test="spacing-margin">
          <div className="dt-spacing__label">margin</div>
          <SpacingField
            kind="top"
            property="margin-top"
            shorthand="margin"
            domElement={el}
            entries={allEntries}
            tokenRows={tokenRows}
            onAfterEdit={onAfterEdit}
          />
          <SpacingField
            kind="right"
            property="margin-right"
            shorthand="margin"
            domElement={el}
            entries={allEntries}
            tokenRows={tokenRows}
            onAfterEdit={onAfterEdit}
          />
          <SpacingField
            kind="bottom"
            property="margin-bottom"
            shorthand="margin"
            domElement={el}
            entries={allEntries}
            tokenRows={tokenRows}
            onAfterEdit={onAfterEdit}
          />
          <SpacingField
            kind="left"
            property="margin-left"
            shorthand="margin"
            domElement={el}
            entries={allEntries}
            tokenRows={tokenRows}
            onAfterEdit={onAfterEdit}
          />
        </div>
      </div>
    </div>
  );
}

interface SpacingFieldProps {
  kind: string;
  property: string;
  shorthand: string;
  domElement: HTMLElement;
  entries: TokenEntry[];
  tokenRows: ResolvedProperty[];
  onAfterEdit?: () => void;
}

function SpacingField(props: SpacingFieldProps): ReactElement {
  const { kind, property, shorthand, domElement, entries, tokenRows, onAfterEdit } = props;
  const tokenRow = findSpacingTokenRow(tokenRows, property, shorthand);

  return (
    <label className="dt-spacing__side">
      <span className="dt-spacing__side-label">{kind}</span>
      <TokenField
        property={property}
        tokenRow={tokenRow}
        domElement={domElement}
        entries={entries}
        onAfterEdit={onAfterEdit}
      />
    </label>
  );
}
