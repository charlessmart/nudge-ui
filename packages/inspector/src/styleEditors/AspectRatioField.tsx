import type { ReactElement } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "@design-tool/css/model";
import { FieldRow } from "../ui/FieldRow.tsx";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import { TokenField } from "../tokens/TokenField.tsx";
import { meaningfulLayoutValue } from "./layoutValue.ts";
import { getDesignToolTokenEntries } from "../runtimeConfig.ts";

export const ASPECT_RATIO_PRESETS = ["auto", "1 / 1", "4 / 3", "3 / 2", "16 / 9", "21 / 9"];

export interface AspectRatioFieldProps {
  domElement: HTMLElement;
  entries?: TokenEntry[];
  tokenRow?: ResolvedProperty | null;
  revision?: number;
  onAfterEdit?: () => void;
  className?: string;
}

export function AspectRatioField({
  domElement: el,
  entries = getDesignToolTokenEntries(),
  tokenRow,
  onAfterEdit,
  className,
}: AspectRatioFieldProps): ReactElement {
  return (
    <FieldRow label="aspect-ratio" data-test="layout-size-aspect-ratio" className={className}>
      <ControlSurface>
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
      </ControlSurface>
    </FieldRow>
  );
}
