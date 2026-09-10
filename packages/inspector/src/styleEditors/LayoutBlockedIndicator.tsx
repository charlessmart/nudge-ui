import type { ReactElement } from "react";
import { Tooltip } from "@base-ui/react/tooltip";

export interface LayoutBlockedIndicatorProps {
  blockedBy: string;
}

/** Explains why a layout preview cannot override an inline-authored value. */
export function LayoutBlockedIndicator({ blockedBy }: LayoutBlockedIndicatorProps): ReactElement {
  return (
    <Tooltip.Provider>
      <Tooltip.Root disableHoverablePopup>
        <Tooltip.Trigger
          type="button"
          delay={0}
          className="layout-combo-blocked"
          data-test="layout-combo-blocked"
          aria-label={`Blocked by inline style: ${blockedBy}`}
        >
          <span className="layout-combo-blocked__symbol" aria-hidden="true">!</span>
        </Tooltip.Trigger>
        <Tooltip.Portal container={document.getElementById("nudge-ui-root")?.shadowRoot ?? document.body}>
          <Tooltip.Positioner className="at-rule-tooltip-positioner" side="top" align="end" sideOffset={7}>
            <Tooltip.Popup className="at-rule-tooltip" data-test="layout-combo-blocked-tooltip">
              <div className="at-rule-tooltip__rules">
                <div className="at-rule-tooltip__rule at-rule-tooltip__rule--active">
                  Set inline (<code>{blockedBy}</code>). Previews can&apos;t beat inline styles — move it to a stylesheet to edit it here.
                </div>
              </div>
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
