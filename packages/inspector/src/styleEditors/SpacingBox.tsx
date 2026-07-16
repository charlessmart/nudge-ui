import type { ReactElement } from "react";
import type { ResolvedProperty } from "../tokens/resolution.ts";
import { TokenField } from "../tokens/TokenField.tsx";
import type { TokenEntry } from "virtual:design-tokens";
import type { SelectedElement } from "../selectionStore.ts";

function findTokenRow(rows: ResolvedProperty[], prop: string): ResolvedProperty | null {
  return rows.find((r) => r.property === prop) ?? null;
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
          <div className="dt-spacing__label">Padding</div>
          <div className="dt-spacing__grid">
          <SpacingField
            kind="top"
            property="padding-top"
            domElement={el}
            entries={allEntries}
            tokenRows={tokenRows}
            onAfterEdit={onAfterEdit}
          />
          <SpacingField
            kind="right"
            property="padding-right"
            domElement={el}
            entries={allEntries}
            tokenRows={tokenRows}
            onAfterEdit={onAfterEdit}
          />
          <SpacingField
            kind="bottom"
            property="padding-bottom"
            domElement={el}
            entries={allEntries}
            tokenRows={tokenRows}
            onAfterEdit={onAfterEdit}
          />
          <SpacingField
            kind="left"
            property="padding-left"
            domElement={el}
            entries={allEntries}
            tokenRows={tokenRows}
            onAfterEdit={onAfterEdit}
          />
          </div>
        </div>
        <div className="dt-spacing__group" data-test="spacing-margin">
          <div className="dt-spacing__label">Margin</div>
          <div className="dt-spacing__grid">
          <SpacingField
            kind="top"
            property="margin-top"
            domElement={el}
            entries={allEntries}
            tokenRows={tokenRows}
            onAfterEdit={onAfterEdit}
          />
          <SpacingField
            kind="right"
            property="margin-right"
            domElement={el}
            entries={allEntries}
            tokenRows={tokenRows}
            onAfterEdit={onAfterEdit}
          />
          <SpacingField
            kind="bottom"
            property="margin-bottom"
            domElement={el}
            entries={allEntries}
            tokenRows={tokenRows}
            onAfterEdit={onAfterEdit}
          />
          <SpacingField
            kind="left"
            property="margin-left"
            domElement={el}
            entries={allEntries}
            tokenRows={tokenRows}
            onAfterEdit={onAfterEdit}
          />
          </div>
        </div>
      </div>
    </div>
  );
}

interface SpacingFieldProps {
  kind: string;
  property: string;
  domElement: HTMLElement;
  entries: TokenEntry[];
  tokenRows: ResolvedProperty[];
  onAfterEdit?: () => void;
}

function SpacingField(props: SpacingFieldProps): ReactElement {
  const { kind, property, domElement, entries, tokenRows, onAfterEdit } = props;
  const tokenRow = findTokenRow(tokenRows, property);

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
