import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import type { TokenEntry } from "virtual:design-tokens";
import { getStateStyleValue } from "../stateValue.ts";
import type { SelectedElement } from "../selectionStore.ts";
import type { ResolvedProperty } from "@nudge-ui/css/model";
import { TokenField } from "../tokens/TokenField.tsx";
import { formatInspectorLabel } from "../ui/labels.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import { setStyle } from "./styleActions.ts";
import { getNudgeUiTokenEntries } from "../runtimeConfig.ts";
import type { EditTarget } from "../editTarget.ts";
import type { AggregatedProperty } from "../inspection/aggregateInspection.ts";

export interface ColorPickerProps {
  element: SelectedElement;
  elements?: readonly SelectedElement[];
  property?: string;
  entries?: TokenEntry[];
  tokenRow?: ResolvedProperty | AggregatedProperty | null;
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
  const { element, elements: selectedElementsProp, property = "color", entries, tokenRow, onAfterEdit } = props;
  const el = element.domElement;
  const selectedElements = useMemo(
    () => selectedElementsProp && selectedElementsProp.length > 0 ? selectedElementsProp : [element],
    [element, selectedElementsProp],
  );
  const target: EditTarget = selectedElements.length > 1
    ? selectedElements.map((selected) => selected.domElement)
    : el;
  const allEntries = entries ?? getNudgeUiTokenEntries();
  const aggregate = tokenRow && "aggregate" in tokenRow
    ? tokenRow.aggregate
    : null;
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
  const mixed = aggregate?.valueState === "mixed";
  const displayValue = aggregate
    ? mixed ? "Mixed" : aggregate.values[0]
    : undefined;
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
              initialValue={isEmpty ? "" : undefined}
              domElement={el}
              editTarget={target}
              displayValue={displayValue}
              mixed={mixed}
              attributionTokens={aggregate?.tokenState === "mixed" ? ["Mixed tokens"] : undefined}
              entries={allEntries}
              onAfterEdit={handleAfterEdit}
            />
          </ControlSurface>
        </div>
      )}
    </div>
  );
}
