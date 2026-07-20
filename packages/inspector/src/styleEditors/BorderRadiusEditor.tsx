import type { ReactElement } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import { tokens } from "virtual:design-tokens";
import type { ResolvedProperty } from "../tokens/resolution.ts";
import { TokenField } from "../tokens/TokenField.tsx";
import type { SelectedElement } from "../selectionStore.ts";
import { FieldRow } from "../ui/FieldRow.tsx";

export interface BorderRadiusEditorProps {
  element: SelectedElement;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  onAfterEdit?: () => void;
}

export function BorderRadiusEditor(props: BorderRadiusEditorProps): ReactElement {
  const { element, entries, tokenRows = [], onAfterEdit } = props;
  const el = element.domElement;
  const allEntries = entries ?? tokens;
  const tokenRow = tokenRows.find((row) => row.property === "border-radius") ?? null;

  return (
    <div className="dt-editor" data-test="border-radius-editor">
      <div className="dt-editor__title">Border Radius</div>
      <div className="dt-property">
        <FieldRow label="Border Radius">
          <TokenField
            property="border-radius"
            tokenRow={tokenRow}
            domElement={el}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
          />
        </FieldRow>
      </div>
    </div>
  );
}
