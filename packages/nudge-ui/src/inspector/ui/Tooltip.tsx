import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { FocusEvent, ReactElement, ReactNode } from "react";
import { cx } from "./classNames.ts";
import { portalContainer } from "./portalContainer.ts";

export interface TooltipGroupProps {
  children?: ReactNode;
  delay?: number;
  closeDelay?: number;
  timeout?: number;
}

export function TooltipGroup({
  children,
  delay = 500,
  closeDelay = 0,
  timeout = 400,
}: TooltipGroupProps): ReactElement {
  return (
    <BaseTooltip.Provider delay={delay} closeDelay={closeDelay} timeout={timeout}>
      {children}
    </BaseTooltip.Provider>
  );
}

export interface TooltipProps {
  children: ReactElement;
  content?: ReactNode;
  shortcut?: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  delay?: number;
  closeDelay?: number;
  disableFocus?: boolean;
  disabled?: boolean;
  stableTrigger?: boolean;
  triggerClassName?: string;
  positionerClassName?: string;
  popupClassName?: string;
  "data-test"?: string;
}

function isDisabledTrigger(element: ReactElement): boolean {
  // SAFETY: Inspector triggers are host elements with optional disabled props.
  return Boolean((element.props as { disabled?: boolean }).disabled);
}

function defaultTooltipContent(element: ReactElement): ReactNode {
  // SAFETY: Inspector triggers carry label or aria-label for tooltip text.
  const props = element.props as { label?: ReactNode; "aria-label"?: ReactNode };
  return props.label ?? props["aria-label"] ?? null;
}

function preventFocusOpening(event: FocusEvent<HTMLElement>): void {
  if (!("preventBaseUIHandler" in event)) return;
  // SAFETY: The `in` guard proves preventBaseUIHandler exists on this Base UI focus event.
  const preventBaseUIHandler = (event as { preventBaseUIHandler?: unknown }).preventBaseUIHandler;
  if (typeof preventBaseUIHandler === "function") preventBaseUIHandler();
}

export function Tooltip({
  children,
  content,
  shortcut,
  side = "top",
  align = "center",
  sideOffset = 8,
  delay,
  closeDelay,
  disableFocus = false,
  disabled = false,
  stableTrigger = false,
  triggerClassName,
  positionerClassName,
  popupClassName,
  "data-test": dataTest,
}: TooltipProps): ReactElement {
  if (disabled) return children;
  const childDisabled = isDisabledTrigger(children);
  const trigger = stableTrigger || childDisabled ? (
    <span
      className={cx("tooltip__trigger", triggerClassName)}
      data-tooltip-trigger-disabled={childDisabled ? "" : undefined}
    >
      {children}
    </span>
  ) : children;
  const tooltipContent = content ?? defaultTooltipContent(children);

  return (
    <BaseTooltip.Root disableHoverablePopup>
      <BaseTooltip.Trigger
        render={trigger}
        delay={delay}
        closeDelay={closeDelay}
        onFocus={disableFocus ? preventFocusOpening : undefined}
      />
      <BaseTooltip.Portal container={portalContainer()}>
        <BaseTooltip.Positioner
          className={cx("tooltip__positioner", positionerClassName)}
          side={side}
          align={align}
          sideOffset={sideOffset}
        >
          <BaseTooltip.Popup
            className={cx("tooltip__popup", popupClassName)}
            data-test={dataTest}
          >
            <div className="tooltip__content">{tooltipContent}</div>
            {shortcut !== undefined ? <span className="tooltip__shortcut">{shortcut}</span> : null}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
