import type { ReactElement } from "react";
import type { ResolvedProperty } from "../tokens/resolution.ts";
import { TokenField } from "../tokens/TokenField.tsx";
import type { TokenEntry } from "virtual:design-tokens";
import type { SelectedElement } from "../selectionStore.ts";

function findTokenRow(rows: ResolvedProperty[], prop: string): ResolvedProperty | null {
  return rows.find((r) => r.property === prop) ?? null;
}

export interface TypographyProps {
  element: SelectedElement;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  onAfterEdit?: () => void;
}

export function Typography(props: TypographyProps): ReactElement {
  const { element, entries, tokenRows = [], onAfterEdit } = props;
  const el = element.domElement;
  const allEntries = entries ?? [];

  return (
    <div className="dt-editor" data-test="typography">
      <div className="dt-editor__title">Typography</div>
      <div className="dt-typography">
        <div className="dt-field">
          <span className="dt-field__label">font-size</span>
          <TokenField
            property="font-size"
            tokenRow={findTokenRow(tokenRows, "font-size")}
            domElement={el}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
          />
        </div>
        <div className="dt-field">
          <span className="dt-field__label">font-weight</span>
          <TokenField
            property="font-weight"
            tokenRow={findTokenRow(tokenRows, "font-weight")}
            domElement={el}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
          />
        </div>
        <div className="dt-field">
          <span className="dt-field__label">line-height</span>
          <TokenField
            property="line-height"
            tokenRow={findTokenRow(tokenRows, "line-height")}
            domElement={el}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
          />
        </div>
        <div className="dt-field">
          <span className="dt-field__label">letter-spacing</span>
          <TokenField
            property="letter-spacing"
            tokenRow={findTokenRow(tokenRows, "letter-spacing")}
            domElement={el}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
          />
        </div>
        <div className="dt-field">
          <span className="dt-field__label">font-family</span>
          <TokenField
            property="font-family"
            tokenRow={findTokenRow(tokenRows, "font-family")}
            domElement={el}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
          />
        </div>
      </div>
    </div>
  );
}
