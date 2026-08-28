import type { ReactElement } from "react";
import { IconBackground } from "@tabler/icons-react";
import type { TokenEntry } from "virtual:design-tokens";
import { normalizeOpacityPercent } from "@nudge-ui/css/value-semantics";
import type { ResolvedProperty } from "@nudge-ui/css/model";
import type { SelectedElement } from "../selectionStore.ts";
import { getStateStyleValue } from "../stateValue.ts";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import { TokenField } from "../tokens/TokenField.tsx";
import { getNudgeUiTokenEntries } from "../runtimeConfig.ts";

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
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  onAfterEdit?: () => void;
}

export function OpacityEditor({ element, entries, tokenRows = [], onAfterEdit }: OpacityEditorProps): ReactElement {
  const el = element.domElement;
  const allEntries = entries ?? getNudgeUiTokenEntries();
  const row = tokenRows.find((candidate) => candidate.property === "opacity") ?? null;
  const value = effectiveOpacity(el, row);
  const editable = row?.propertyOpacity?.editable ?? true;
  const activeToken = row?.propertyOpacity?.tokenName ?? row?.tokenName;

  return (
    <div className="appearance__field opacity-editor" data-test="opacity-editor">
      <div className="appearance__field-label">Opacity</div>
      <ControlSurface data-test="opacity-control">
        <TokenField
          property="opacity"
          semanticSlot="opacity"
          tokenRow={row}
          initialValue={value}
          displayValue={value}
          domElement={el}
          entries={allEntries}
          inputDataTest="opacity-input"
          editMetadata={metadataFor(row)}
          disabled={!editable}
          formatRawValue={(raw) => normalizeOpacityPercent(raw) ?? ""}
          leading={<IconBackground size={16} stroke={1.8} aria-hidden="true" />}
          trailing={activeToken ? <span className="opacity-editor__effective" data-test="opacity-effective">{value}</span> : undefined}
          label="Opacity"
          onAfterEdit={onAfterEdit}
        />
      </ControlSurface>
    </div>
  );
}
