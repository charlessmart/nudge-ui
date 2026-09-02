import { useMemo } from "react";
import type { ReactElement } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "@nudge-ui/css/model";
import { MarginSideIndicator, SideControls, SIDE_NAMES, type SideValueSlot } from "../ui/SideValuesField.tsx";
import { TokenField } from "../tokens/TokenField.tsx";
import { meaningfulLayoutValue } from "./layoutValue.ts";
import { getNudgeUiTokenEntries } from "../runtimeConfig.ts";

const OFFSET_PRESETS = ["auto", "0", "50%", "100%"];

export interface PositionInsetsProps {
  domElement: HTMLElement;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  revision?: number;
  onAfterEdit?: () => void;
}

export function PositionInsets({
  domElement: el,
  entries,
  tokenRows = [],
  revision = 0,
  onAfterEdit,
}: PositionInsetsProps): ReactElement {
  const allEntries = entries ?? getNudgeUiTokenEntries();
  const insetSlots = useMemo(() => SIDE_NAMES.map((side): SideValueSlot => ({
    side,
    icon: <MarginSideIndicator side={side} />,
    control: (
      <TokenField
        property={side}
        tokenRow={tokenRows.find((row) => row.property === side) ?? null}
        initialValue={meaningfulLayoutValue(el, side)}
        domElement={el}
        entries={allEntries}
        suggestions={OFFSET_PRESETS}
        onAfterEdit={onAfterEdit}
      />
    ),
  })), [allEntries, el, onAfterEdit, revision, tokenRows]);

  return (
    <div className="layout__group" data-test="layout-position">
      <div className="editor__title">Position</div>
      <SideControls label="Inset" sides={insetSlots} />
    </div>
  );
}
