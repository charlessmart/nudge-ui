import type { ReactElement } from "react";
import { InlineStyleWarning } from "../ui/InlineStyleWarning.tsx";

export interface LayoutBlockedIndicatorProps {
  blockedBy: string | null;
}

/** Explains why a layout preview cannot override an inline-authored value. */
export function LayoutBlockedIndicator({ blockedBy }: LayoutBlockedIndicatorProps): ReactElement | null {
  return (
    <InlineStyleWarning
      blockedBy={blockedBy}
      dataTest="layout-combo-blocked"
      tooltipDataTest="layout-combo-blocked-tooltip"
      className="layout-combo-blocked"
      symbolClassName="layout-combo-blocked__symbol"
    />
  );
}
