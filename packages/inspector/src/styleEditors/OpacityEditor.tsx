import type { ReactElement } from "react";
import { IconBackground } from "@tabler/icons-react";
import type { TokenEntry } from "virtual:design-tokens";
import { normalizeOpacityPercent } from "@nudge-ui/css/value-semantics";
import type { ResolvedProperty } from "@nudge-ui/css/model";
import type { SelectedElement } from "../selection/selectionStore.ts";
import { getStateStyleValue } from "../shell/stateValue.ts";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import { TokenField } from "../tokens/TokenField.tsx";
import { getNudgeUiTokenEntries } from "../runtime/runtimeConfig.ts";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";

function metadataFor(row: ResolvedProperty | null) {
  return row?.sourceProperty
    ? { sourceProperty: row.sourceProperty, sourceAuthoredValue: row.authored ?? row.declaredValue }
    : undefined;
}

function effectiveOpacity(element: HTMLElement, row: ResolvedProperty | null): string {
  return row?.propertyOpacity?.value
    ?? normalizeOpacityPercent(row?.resolvedValue ?? "")
    ?? normalizeOpacityPercent(getStateStyleValue(element, "opacity", "1"))
    ?? "100%";
}

export interface OpacityEditorProps {
  element: SelectedElement;
  selection?: StyleSelection | null;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  onAfterEdit?: () => void;
}

export function OpacityEditor({ element, selection, entries, tokenRows = [], onAfterEdit }: OpacityEditorProps): ReactElement {
  const el = element.domElement;
  const editTarget: EditTarget = selection?.target ?? el;
  const allEntries = entries ?? getNudgeUiTokenEntries();
  const row = tokenRows.find((candidate) => candidate.property === "opacity") ?? null;
  const selectedProperty = selection && selection.elements.length > 1
    ? selection.getProperty("opacity")
    : null;
  const mixed = selectedProperty?.value.kind === "mixed";
  const value = mixed
    ? "Mixed"
    : selectedProperty?.value.kind === "common" ? selectedProperty.value.value : effectiveOpacity(el, row);
  const editable = row?.propertyOpacity?.editable ?? true;
  const activeToken = mixed
    ? null
    : selectedProperty
      ? selectedProperty.token.kind === "common" ? selectedProperty.token.name : null
      : row?.propertyOpacity?.tokenName ?? row?.tokenName;

  return (
    <div className="appearance__field opacity-editor" data-test="opacity-editor">
      <div className="appearance__field-label">Opacity</div>
      <ControlSurface data-test="opacity-control">
        <TokenField
          property="opacity"
          semanticSlot="opacity"
          tokenRow={row}
          selection={selection}
          initialValue={value}
          displayValue={value}
          domElement={el}
          editTarget={editTarget}
          entries={allEntries}
          inputDataTest="opacity-input"
          editMetadata={metadataFor(row)}
          disabled={!editable}
          mixed={mixed}
          formatRawValue={(raw) => normalizeOpacityPercent(raw) ?? ""}
          leading={<IconBackground size={16} stroke={1.8} aria-hidden="true" />}
          trailing={activeToken ? <span className="opacity-editor__effective" data-test="opacity-effective">{value}</span> : undefined}
          label="Opacity"
          onAfterEdit={onAfterEdit}
          chipVariant="small"
        />
      </ControlSurface>
    </div>
  );
}
