import type { ReactElement, ReactNode } from "react";
import type { TokenEntry } from "../../css/model/index.ts";
import type { ResolvedProperty } from "../../css/model/index.ts";
import { TokenField } from "../tokens/TokenField.tsx";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";
import { formatInspectorLabel } from "../ui/labels.ts";
import { meaningfulLayoutValue } from "./layoutValue.ts";

export const GAP_PRESETS = ["0", "0.25rem", "0.5rem", "0.75rem", "1rem", "1.5rem", "2rem", "3rem"];

export interface GapFieldProps {
  property: "row-gap" | "column-gap";
  domElement: HTMLElement;
  editTarget?: EditTarget;
  selection?: StyleSelection | null;
  entries: TokenEntry[];
  tokenRows: ResolvedProperty[];
  leading?: ReactNode;
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
  leading,
  onAfterEdit,
}: GapFieldProps): ReactElement {
  const tokenRow = tokenRows.find((row) => row.property === property) ?? null;
  return (
    <span
      className="layout-combo"
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
        leading={leading}
        inputDataTest={`layout-combo-input-${property}`}
        label={formatInspectorLabel(property)}
        chipVariant="small"
        inlineWarningDataTest="layout-combo-blocked"
        inlineWarningTooltipDataTest="layout-combo-blocked-tooltip"
        onAfterEdit={onAfterEdit}
      />
    </span>
  );
}
