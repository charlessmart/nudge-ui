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
  trailing?: ReactNode;
  /** Replaces the shown value (and ignores the token) while another property overrides the gap, such as `Auto`. */
  displayOverride?: string;
  interceptRaw?: (value: string) => boolean;
  onAfterEdit?: () => void;
}

export function GapField({
  property,
  domElement: el,
  editTarget,
  selection,
  entries,
  tokenRows,
  leading,
  trailing,
  displayOverride,
  interceptRaw,
  onAfterEdit,
}: GapFieldProps): ReactElement {
  const tokenRow = displayOverride !== undefined ? null : tokenRows.find((row) => row.property === property) ?? null;
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
        displayValue={displayOverride}
        domElement={el}
        editTarget={editTarget}
        entries={entries}
        suggestions={GAP_PRESETS}
        leading={leading}
        trailing={trailing}
        interceptRaw={interceptRaw}
        inputDataTest={`layout-combo-input-${property}`}
        label={formatInspectorLabel(property)}
        inlineWarningDataTest="layout-combo-blocked"
        inlineWarningTooltipDataTest="layout-combo-blocked-tooltip"
        onAfterEdit={onAfterEdit}
      />
    </span>
  );
}
