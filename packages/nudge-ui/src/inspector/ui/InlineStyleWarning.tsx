import type { ReactElement } from "react";
import { cx } from "./classNames.ts";
import { Tooltip } from "./Tooltip.tsx";

export interface InlineStyleWarningProps {
  /** Inline declaration blocking the field; renders nothing when null. */
  blockedBy: string | null;
  dataTest?: string;
  tooltipDataTest?: string;
  className?: string;
  symbolClassName?: string;
}

export function inlineStyleWarningContent(blockedBy: string | null): ReactElement | undefined {
  if (blockedBy === null) return undefined;
  return (
    <div className="at-rule-tooltip__rules">
      <div className="at-rule-tooltip__rule at-rule-tooltip__rule--active">
        Set inline (<code>{blockedBy}</code>). Previews can&apos;t beat inline styles — move it to a stylesheet to edit it here.
      </div>
    </div>
  );
}

export function InlineStyleWarning({
  blockedBy,
  dataTest = "inline-style-warning",
  tooltipDataTest,
  className,
  symbolClassName,
}: InlineStyleWarningProps): ReactElement | null {
  if (blockedBy === null) return null;
  return (
    <Tooltip
      content={inlineStyleWarningContent(blockedBy)}
      delay={0}
      positionerClassName="at-rule-tooltip-positioner"
      popupClassName="at-rule-tooltip"
      data-test={tooltipDataTest}
    >
      <button
        type="button"
        className={cx("inline-style-warning", className)}
        data-test={dataTest}
        aria-label={`Blocked by inline style: ${blockedBy}`}
      >
        <span className={cx("inline-style-warning__symbol", symbolClassName)} aria-hidden="true">!</span>
      </button>
    </Tooltip>
  );
}
