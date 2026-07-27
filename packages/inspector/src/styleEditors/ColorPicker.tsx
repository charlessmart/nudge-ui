import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import type { TokenEntry } from "virtual:design-tokens";
import { tokens } from "virtual:design-tokens";
import { getStateStyleValue } from "../stateValue.ts";
import type { SelectedElement } from "../selectionStore.ts";
import type { ResolvedProperty } from "../tokens/resolution.ts";
import { TokenField } from "../tokens/TokenField.tsx";
import { formatInspectorLabel } from "../ui/labels.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { setStyle } from "./styleActions.ts";

export interface ColorPickerProps {
  element: SelectedElement;
  property?: string;
  entries?: TokenEntry[];
  tokenRow?: ResolvedProperty | null;
  onAfterEdit?: () => void;
}

function colorSectionTitle(property: string): string {
  if (property === "background-color") return "Background Color";
  if (property === "color") return "Color";
  return formatInspectorLabel(property);
}

function isZeroColorComponent(value: string): boolean {
  return /^0(?:\.0+)?%?$/.test(value.trim());
}

export function isEmptyColorValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "none" || normalized === "transparent") return true;
  if (/^#(?:0000|00000000)$/.test(normalized)) return true;

  const match = normalized.match(/^rgba?\((.*)\)$/);
  if (!match) return false;
  const components = match[1]!.split(/[\s,\/]+/).filter(Boolean);
  return components.length === 4
    && components.slice(0, 3).every(isZeroColorComponent)
    && isZeroColorComponent(components[3]!);
}

export function ColorPicker(props: ColorPickerProps): ReactElement {
  const { element, property = "color", entries, tokenRow, onAfterEdit } = props;
  const el = element.domElement;
  const allEntries = entries ?? tokens;
  const isEmpty = (tokenRow?.declaredValue !== undefined && isEmptyColorValue(tokenRow.declaredValue))
    || (tokenRow?.resolvedValue !== undefined && isEmptyColorValue(tokenRow.resolvedValue))
    || isEmptyColorValue(getStateStyleValue(el, property));
  const [fieldAdded, setFieldAdded] = useState(false);

  useEffect(() => {
    setFieldAdded(false);
  }, [el, property]);

  function handleAfterEdit(): void {
    setFieldAdded(false);
    onAfterEdit?.();
  }

  const showTokenField = !isEmpty || fieldAdded;

  function handleRemoveColor(): void {
    setStyle(el, property, "transparent");
    setFieldAdded(false);
    onAfterEdit?.();
  }

  return (
    <div className={`dt-editor`} data-test="color-picker" data-property={property}>
      <div className="dt-editor__title-row">
        <div className="dt-editor__title">{colorSectionTitle(property)}</div>
        {showTokenField ? (
          <IconButton
            variant="quiet"
            label={`Remove ${colorSectionTitle(property)}`}
            data-test="remove-color"
            className="dt-color__remove"
            onClick={handleRemoveColor}
          >
            <IconMinus size={"var(--dt-icon-size-small)"} stroke={1.8} aria-hidden="true" />
          </IconButton>
        ) : (
          <IconButton
            variant="quiet"
            label={`Add ${colorSectionTitle(property)}`}
            data-test="add-color"
            className="dt-color__add"
            onClick={() => setFieldAdded(true)}
          >
            <IconPlus size={"var(--dt-icon-size-small)"} stroke={1.8} aria-hidden="true" />
          </IconButton>
        )}
      </div>
      {showTokenField && (
        <div className="dt-color">
          <TokenField
            property={property}
            tokenRow={isEmpty ? null : tokenRow}
            initialValue={isEmpty ? "" : undefined}
            domElement={el}
            entries={allEntries}
            onAfterEdit={handleAfterEdit}
          />
        </div>
      )}
    </div>
  );
}
