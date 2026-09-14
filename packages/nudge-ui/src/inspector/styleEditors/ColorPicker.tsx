import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import type { TokenEntry } from "../../css/model/index.ts";
import { getStateStyleValue } from "../shell/stateValue.ts";
import type { SelectedElement } from "../selection/selectionStore.ts";
import type { ResolvedProperty } from "../../css/model/index.ts";
import { TokenField } from "../tokens/TokenField.tsx";
import { formatInspectorLabel } from "../ui/labels.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import { setStyle } from "../tokens/editActions.ts";
import { getNudgeUiTokenEntries } from "../runtime/runtimeConfig.ts";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";

export interface ColorPickerProps {
  element: SelectedElement;
  selection?: StyleSelection | null;
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
  const components = match[1]!.split(/[\s,/]+/).filter(Boolean);
  return components.length === 4
    && components.slice(0, 3).every(isZeroColorComponent)
    && isZeroColorComponent(components[3]!);
}

export function ColorPicker(props: ColorPickerProps): ReactElement {
  const { element, selection, property = "color", entries, tokenRow, onAfterEdit } = props;
  const el = element.domElement;
  const selectedElements = useMemo(() => selection?.elements ?? [element], [element, selection]);
  const target: EditTarget = selection?.target ?? el;
  const allEntries = entries ?? getNudgeUiTokenEntries();
  const declaredValue = tokenRow?.declaredValue?.trim() ?? "";
  const paintedValue = getStateStyleValue(el, property);
  const resolvedValue = tokenRow?.resolvedValue ?? paintedValue;
  // An explicit declaration remains meaningful even when it paints as empty
  // for text color (for example `transparent` or `var(--missing, transparent)`).
  // A transparent background, however, is the empty state represented by the
  // remove action and should not remain visible as an authored value.
  const emptyValues = selectedElements.map((selected) => getStateStyleValue(selected.domElement, property));
  const isEmpty = selectedElements.length > 1
    ? emptyValues.every((value) => isEmptyColorValue(value))
    : property === "background-color"
      ? isEmptyColorValue(declaredValue) || isEmptyColorValue(resolvedValue) || isEmptyColorValue(paintedValue)
      : declaredValue.length === 0 && isEmptyColorValue(resolvedValue);
  const [fieldAdded, setFieldAdded] = useState(false);
  const [backgroundRemoved, setBackgroundRemoved] = useState(false);

  useEffect(() => {
    setFieldAdded(false);
    setBackgroundRemoved(false);
  }, [el, property, selectedElements]);

  function handleAfterEdit(): void {
    setFieldAdded(false);
    setBackgroundRemoved(false);
    onAfterEdit?.();
  }

  const showTokenField = (!isEmpty && !backgroundRemoved) || fieldAdded;

  function handleRemoveColor(): void {
    setStyle(target, property, "transparent");
    setFieldAdded(false);
    setBackgroundRemoved(property === "background-color");
    onAfterEdit?.();
  }

  return (
    <div className={`editor`} data-test="color-picker" data-property={property}>
      <div className="editor__title-row">
        <div className="editor__title">{colorSectionTitle(property)}</div>
        {showTokenField ? (
          <IconButton
            variant="quiet"
            label={`Remove ${colorSectionTitle(property)}`}
            data-test="remove-color"
            className="color__remove"
            onClick={handleRemoveColor}
          >
            <IconMinus size={"var(--icon-size-small)"} stroke={1.8} aria-hidden="true" />
          </IconButton>
        ) : (
          <IconButton
            variant="quiet"
            label={`Add ${colorSectionTitle(property)}`}
            data-test="add-color"
            className="color__add"
            onClick={() => setFieldAdded(true)}
          >
            <IconPlus size={"var(--icon-size-small)"} stroke={1.8} aria-hidden="true" />
          </IconButton>
        )}
      </div>
      {showTokenField && (
        <div className="color">
          <ControlSurface>
            <TokenField
              property={property}
              tokenRow={isEmpty ? null : tokenRow}
              selection={selection}
              initialValue={isEmpty ? "" : undefined}
              domElement={el}
              editTarget={target}
              entries={allEntries}
              onAfterEdit={handleAfterEdit}
            />
          </ControlSurface>
        </div>
      )}
    </div>
  );
}
