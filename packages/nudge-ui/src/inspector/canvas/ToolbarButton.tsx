import type { ReactElement } from "react";
import { IconButton } from "../ui/IconButton.tsx";
import type { IconButtonProps } from "../ui/IconButton.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";

export interface ToolbarButtonProps {
  readonly label: string;
  readonly active: boolean;
  readonly icon: ReactElement;
  /** Shown instead of `icon` while active. */
  readonly activeIcon?: ReactElement;
  readonly shortcut?: string;
  /** Tooltip text when it should differ from the accessible label. */
  readonly tooltip?: string;
  /** Main tools use the accent; drawer options use the quiet well. */
  readonly activeStyle?: IconButtonProps["activeStyle"];
  /** Removes the button from the tab order while its drawer is collapsed or sliding. */
  readonly hidden?: boolean;
  readonly disabled?: boolean;
  /** For buttons that open a popover; replaces `aria-pressed` with `aria-expanded`. */
  readonly expanded?: boolean;
  readonly dataTest: string;
  readonly onClick: () => void;
}

/** The one button every Canvas toolbar tool and drawer option is built from. */
export function ToolbarButton({
  label,
  active,
  icon,
  activeIcon,
  shortcut,
  tooltip,
  activeStyle,
  hidden,
  disabled,
  expanded,
  dataTest,
  onClick,
}: ToolbarButtonProps): ReactElement {
  return (
    <Tooltip content={tooltip ?? label} shortcut={shortcut} disabled={expanded} stableTrigger>
      <IconButton
        variant="quiet"
        size="large"
        activeStyle={activeStyle}
        label={label}
        aria-pressed={expanded === undefined ? active : undefined}
        aria-expanded={expanded}
        data-active={active ? "true" : "false"}
        data-test={dataTest}
        tabIndex={hidden ? -1 : undefined}
        disabled={disabled}
        onClick={onClick}
      >
        {active && activeIcon ? activeIcon : icon}
      </IconButton>
    </Tooltip>
  );
}
