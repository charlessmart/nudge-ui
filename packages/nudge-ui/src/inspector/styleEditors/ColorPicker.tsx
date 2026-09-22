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
import { hasAuthoredProperty, isZeroCssValue } from "./stylePresence.ts";
import { useFieldVisibility } from "./useFieldVisibility.ts";

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

export function isEmptyColorValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "none" || normalized === "transparent") return true;
  if (/^#(?:[0-9a-f]{3}0|[0-9a-f]{6}00)$/.test(normalized)) return true;

  const match = normalized.match(/^rgba?\((.*)\)$/);
  if (!match) return false;
  const components = match[1]!.split(/[\s,/]+/).filter(Boolean);
  return components.length === 4
    && isZeroCssValue(components[3]!);
}

export function ColorPicker(props: ColorPickerProps): ReactElement {
  const { element, selection, property = "color", entries, tokenRow, onAfterEdit } = props;
  const el = element.domElement;
  const selectedElements = selection?.domElements ?? [el];
  const target: EditTarget = selection?.target ?? el;
  const allEntries = entries ?? getNudgeUiTokenEntries();
  const hasColor = hasAuthoredProperty(selection, property, tokenRow)
    || selectedElements.some((selected) => !isEmptyColorValue(getStateStyleValue(selected, property)));
  const visibility = useFieldVisibility(selectedElements, property, hasColor);
  const showTokenField = visibility.visible;

  function handleRemoveColor(): void {
    setStyle(target, property, "transparent");
    visibility.hide();
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
            onClick={visibility.show}
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
              tokenRow={tokenRow}
              selection={selection}
              domElement={el}
              editTarget={target}
              entries={allEntries}
              onAfterEdit={onAfterEdit}
            />
          </ControlSurface>
        </div>
      )}
    </div>
  );
}
