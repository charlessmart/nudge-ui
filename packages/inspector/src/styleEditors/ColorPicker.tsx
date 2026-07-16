import type { ReactElement } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import { tokens } from "virtual:design-tokens";
import type { SelectedElement } from "../selectionStore.ts";
import type { ResolvedProperty } from "../tokens/resolution.ts";
import { TokenField } from "../tokens/TokenField.tsx";
import { FieldRow } from "../ui/FieldRow.tsx";
import { ColorSwatch } from "../ui/ColorSwatch.tsx";

export interface ColorPickerProps {
  element: SelectedElement;
  property?: string;
  entries?: TokenEntry[];
  tokenRow?: ResolvedProperty | null;
  onAfterEdit?: () => void;
}

export function ColorPicker(props: ColorPickerProps): ReactElement {
  const { element, property = "color", entries, tokenRow, onAfterEdit } = props;
  const el = element.domElement;
  const allEntries = entries ?? tokens;

  // `tokenRow` is state-aware. Prefer it so selecting a hovered element still
  // presents its Base value instead of the value currently painted by :hover.
  const computedValue = tokenRow?.resolvedValue ?? (typeof window !== "undefined"
    ? getComputedStyle(el).getPropertyValue(property).trim()
    : "");

  return (
    <div className="dt-editor" data-test="color-picker" data-property={property}>
      <div className="dt-editor__title">Color · {property}</div>
      <div className="dt-color">
        <div className="dt-color__row">
          <ColorSwatch color={computedValue} data-test="color-swatch" />
          <span className="dt-color__computed" data-test="color-computed">
            {computedValue || "—"}
          </span>
        </div>
        <FieldRow label="value">
          <TokenField
            property={property}
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
