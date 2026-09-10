import type { ReactElement } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "@nudge-ui/css/model";
import { TokenField } from "../tokens/TokenField.tsx";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";
import { formatInspectorLabel } from "../ui/labels.ts";
import { inlineAuthoredValue, meaningfulLayoutValue } from "./layoutValue.ts";
import { LayoutBlockedIndicator } from "./LayoutBlockedIndicator.tsx";

export const GAP_PRESETS = ["0", "0.25rem", "0.5rem", "0.75rem", "1rem", "1.5rem", "2rem", "3rem"];

export interface GapFieldProps {
  property: "row-gap" | "column-gap";
  domElement: HTMLElement;
  editTarget?: EditTarget;
  selection?: StyleSelection | null;
  entries: TokenEntry[];
  tokenRows: ResolvedProperty[];
  onAfterEdit?: () => void;
}

/** Renders a gap value with a token chip or the legacy raw-value fallback. */
export function GapField({
  property,
  domElement: el,
  editTarget,
  selection,
  entries,
  tokenRows,
  onAfterEdit,
}: GapFieldProps): ReactElement {
  const tokenRow = tokenRows.find((row) => row.property === property) ?? null;
  const blockedBy = inlineAuthoredValue(el, property);

  return (
    <span
      className={`layout-combo${blockedBy ? " layout-combo--blocked" : ""}`}
      data-test="layout-combo"
      data-property={property}
    >
      <TokenField
        property={property}
        selection={selection}
        tokenRow={tokenRow}
        initialValue={meaningfulLayoutValue(el, property)}
        domElement={el}
        editTarget={editTarget}
        entries={entries}
        suggestions={GAP_PRESETS}
        inputDataTest={`layout-combo-input-${property}`}
        label={formatInspectorLabel(property)}
        chipVariant="small"
        disabled={blockedBy !== null}
        onAfterEdit={onAfterEdit}
      />
      {blockedBy ? <LayoutBlockedIndicator blockedBy={blockedBy} /> : null}
    </span>
  );
}
