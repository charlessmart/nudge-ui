import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ReactElement, ReactNode } from "react";

export interface InspectorPopoverProps {
  triggerElement: ReactElement;
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  "data-test"?: string;
}

/**
 * Base UI popover anchored inside the inspector shadow root. Unlike the
 * listbox popover, this leaves the popup content to the caller for compound
 * settings panels and field controls.
 */
export function InspectorPopover({
  triggerElement,
  children,
  open,
  onOpenChange,
  side = "bottom",
  align = "center",
  sideOffset = 6,
  "data-test": dataTest,
}: InspectorPopoverProps): ReactElement {
  const portalContainer = typeof document !== "undefined"
    ? document.getElementById("design-tool-root")?.shadowRoot ?? document.body
    : null;

  return (
    <BasePopover.Root open={open} onOpenChange={onOpenChange}>
      <BasePopover.Trigger render={triggerElement} data-test={dataTest} />
      <BasePopover.Portal container={portalContainer}>
        <BasePopover.Positioner
          className="dt-inspector-popover__positioner"
          side={side}
          align={align}
          sideOffset={sideOffset}
        >
          <BasePopover.Popup
            className="dt-inspector-popover__popup"
            data-test={dataTest ? `${dataTest}-popover` : undefined}
          >
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
