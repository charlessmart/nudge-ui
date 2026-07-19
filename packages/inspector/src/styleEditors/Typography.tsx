import type { ReactElement } from "react";
import type { ResolvedProperty } from "../tokens/resolution.ts";
import { TokenField } from "../tokens/TokenField.tsx";
import type { TokenEntry } from "virtual:design-tokens";
import type { SelectedElement } from "../selectionStore.ts";
import { FieldRow } from "../ui/FieldRow.tsx";

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
        <FieldRow label="Font Size">
          <TokenField
            property="font-size"
            tokenRow={findTokenRow(tokenRows, "font-size")}
            domElement={el}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
          />
        </FieldRow>
        <FieldRow label="Font Weight">
          <TokenField
            property="font-weight"
            tokenRow={findTokenRow(tokenRows, "font-weight")}
            domElement={el}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
          />
        </FieldRow>
        <FieldRow label="Line Height">
          <TokenField
            property="line-height"
            tokenRow={findTokenRow(tokenRows, "line-height")}
            domElement={el}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
          />
        </FieldRow>
        <FieldRow label="Letter Spacing">
          <TokenField
            property="letter-spacing"
            tokenRow={findTokenRow(tokenRows, "letter-spacing")}
            domElement={el}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
          />
        </FieldRow>
        <FieldRow label="Font Family">
          <TokenField
            property="font-family"
            tokenRow={findTokenRow(tokenRows, "font-family")}
            domElement={el}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
          />
        </FieldRow>
      </div>
    </div>
  );
}
