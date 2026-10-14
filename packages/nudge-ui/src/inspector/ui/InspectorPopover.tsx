import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ReactElement, ReactNode } from "react";
import { Tooltip } from "./Tooltip.tsx";
import { portalContainer } from "./portalContainer.ts";

export interface InspectorPopoverProps {
  triggerElement: ReactElement;
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  triggerTooltip?: ReactNode;
  "data-test"?: string;
}

/** Leaves the popup content to the caller, unlike PopoverListbox. */
export function InspectorPopover({
  triggerElement,
  children,
  open,
  onOpenChange,
  side = "bottom",
  align = "center",
  sideOffset = 6,
  triggerTooltip,
  "data-test": dataTest,
}: InspectorPopoverProps): ReactElement {
  return (
    <BasePopover.Root open={open} onOpenChange={onOpenChange}>
      <Tooltip content={triggerTooltip} disabled={triggerTooltip === undefined}>
        <BasePopover.Trigger render={triggerElement} data-test={dataTest} />
      </Tooltip>
      <BasePopover.Portal container={portalContainer()}>
        <BasePopover.Positioner
          className="inspector-popover__positioner"
          side={side}
          align={align}
          sideOffset={sideOffset}
        >
          <BasePopover.Popup
            className="inspector-popover__popup"
            data-test={dataTest ? `${dataTest}-popover` : undefined}
          >
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
