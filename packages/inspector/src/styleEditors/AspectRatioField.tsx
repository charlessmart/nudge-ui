import type { ReactElement } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import { tokens } from "virtual:design-tokens";
import type { ResolvedProperty } from "../tokens/resolution.ts";
import { FieldRow } from "../ui/FieldRow.tsx";
import { TokenField } from "../tokens/TokenField.tsx";
import { meaningfulLayoutValue } from "./layoutValue.ts";

export const ASPECT_RATIO_PRESETS = ["auto", "1 / 1", "4 / 3", "3 / 2", "16 / 9", "21 / 9"];

export interface AspectRatioFieldProps {
  domElement: HTMLElement;
  entries?: TokenEntry[];
  tokenRow?: ResolvedProperty | null;
  revision?: number;
  onAfterEdit?: () => void;
}

export function AspectRatioField({
  domElement: el,
  entries = tokens,
  tokenRow,
  onAfterEdit,
}: AspectRatioFieldProps): ReactElement {
  return (
    <FieldRow label="aspect-ratio" data-test="layout-size-aspect-ratio">
      <TokenField
        property="aspect-ratio"
        tokenRow={tokenRow}
        initialValue={meaningfulLayoutValue(el, "aspect-ratio")}
        domElement={el}
        entries={entries}
        suggestions={ASPECT_RATIO_PRESETS}
        inputDataTest="layout-aspect-ratio-input"
        onAfterEdit={onAfterEdit}
      />
    </FieldRow>
  );
}
