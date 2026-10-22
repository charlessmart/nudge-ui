import { useState } from "react";
import type { ReactElement } from "react";
import { IconCheck, IconChevronUp, IconLayersSelected, IconRuler } from "@tabler/icons-react";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { IconButton } from "../ui/IconButton.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { portalContainer } from "../ui/portalContainer.ts";
import { cx } from "../ui/classNames.ts";
import { ToolbarButton } from "./ToolbarButton.tsx";
import { setDebugViewMode, useDebugViewMode, type DebugViewMode } from "./debugViewStore.ts";

const ICON_SIZE = "var(--icon-size-large)";

const VIEW_MODES: ReadonlyArray<{
  readonly mode: DebugViewMode;
  readonly label: string;
  readonly Icon: typeof IconRuler;
}> = [
  { mode: "outlines", label: "Outline view", Icon: IconRuler },
  { mode: "explode", label: "Explode view", Icon: IconLayersSelected },
];

export interface ViewToolButtonProps {
  readonly active: boolean;
  /** Turns the tool on; called when a view is picked from the menu while another tool is active. */
  readonly onActivate: () => void;
  /** Toggles the tool, as the button itself does. */
  readonly onToggle: () => void;
}

/** One toolbar tool that shows either Outline view or Explode view; the chevron beside it swaps between them. */
export function ViewToolButton({ active, onActivate, onToggle }: ViewToolButtonProps): ReactElement {
  const mode = useDebugViewMode();
  const [open, setOpen] = useState(false);
  const current = VIEW_MODES.find((candidate) => candidate.mode === mode) ?? VIEW_MODES[0]!;

  return (
    <div className="canvas-toolbar__split">
      <ToolbarButton
        active={active}
        label={current.label}
        shortcut="D"
        icon={<current.Icon size={ICON_SIZE} stroke="var(--icon-stroke-width)" aria-hidden="true" />}
        dataTest="canvas-tool-debug"
        onClick={onToggle}
      />
      <BasePopover.Root open={open} onOpenChange={setOpen}>
        <Tooltip content="Switch view" stableTrigger>
          <BasePopover.Trigger
            render={
              <IconButton
                variant="quiet"
                size="compact"
                className="canvas-toolbar__chevron"
                label="Switch view"
                aria-haspopup="menu"
                aria-expanded={open}
                data-test="canvas-tool-debug-menu"
              />
            }
          >
            <IconChevronUp size={16} stroke={2} aria-hidden="true" />
          </BasePopover.Trigger>
        </Tooltip>
        <BasePopover.Portal container={portalContainer()}>
          <BasePopover.Positioner className="view-tool-menu__positioner" side="top" align="center" sideOffset={8}>
            <BasePopover.Popup className="view-tool-menu" role="menu" aria-label="View">
              {VIEW_MODES.map(({ mode: option, label, Icon }) => (
                <button
                  key={option}
                  type="button"
                  role="menuitemradio"
                  aria-checked={option === mode}
                  className={cx("view-tool-menu__item", option === mode && "view-tool-menu__item--selected")}
                  data-test={`debug-view-${option}`}
                  onClick={() => {
                    setDebugViewMode(option);
                    setOpen(false);
                    if (!active) onActivate();
                  }}
                >
                  <Icon size={16} stroke="var(--icon-stroke-width)" aria-hidden="true" />
                  <span className="view-tool-menu__label">{label}</span>
                  {option === mode ? <IconCheck size={14} aria-hidden="true" /> : null}
                </button>
              ))}
            </BasePopover.Popup>
          </BasePopover.Positioner>
        </BasePopover.Portal>
      </BasePopover.Root>
    </div>
  );
}
