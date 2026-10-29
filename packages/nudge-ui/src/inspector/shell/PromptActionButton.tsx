import { forwardRef, type ReactElement, type ReactNode } from "react";
import { IconChevronDown, IconCopy, IconRefresh } from "@tabler/icons-react";
import { Button, type ButtonProps } from "../ui/Button.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";

export interface PromptActionButtonProps extends ButtonProps {
  readonly copied?: boolean;
  readonly busy?: boolean;
  readonly icon?: ReactNode;
  readonly label?: ReactNode;
  readonly badgeCount?: number;
  readonly hasMenu?: boolean;
}

/** Presents a prompt action without owning the clipboard. */
export const PromptActionButton = forwardRef<HTMLButtonElement, PromptActionButtonProps>(function PromptActionButton({
  copied = false, busy = false,
  icon = <IconCopy size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />,
  label = "Copy prompt", badgeCount = 0, hasMenu = false, ...props
}, ref) {
  return <Button
    ref={ref} variant="primary" className="copy-prompt__main" data-test="copy-prompt" type="button"
    data-copied={copied ? "true" : "false"}
    aria-busy={busy ? "true" : undefined} {...props}
  >
    {icon}{label}
    {badgeCount > 0 ? <span className="copy-prompt__change-count" data-test="copy-prompt-change-count">{badgeCount}</span> : null}
    {hasMenu ? <IconChevronDown size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" /> : null}
  </Button>;
});

export interface PromptActionRowProps {
  readonly children: ReactNode;
  /** The pending changes, joined to the clear button ahead of the prompt action. */
  readonly changes?: ReactNode;
  readonly onClear?: () => void;
  readonly hasChanges?: boolean;
}

/** Pending changes and the button that clears them, then the prompt action. */
export function PromptActionRow({ children, changes, onClear, hasChanges = false }: PromptActionRowProps): ReactElement {
  return (
    <div className="copy-prompt__row">
      {changes || onClear ? (
        <div className="copy-prompt__changes">
          {changes}
          {onClear ? (
            <Tooltip content="Clear changes" stableTrigger>
              <IconButton
                className="copy-prompt__clear-changes"
                variant="secondary"
                label="Clear changes"
                data-test="clear-session"
                disabled={!hasChanges}
                onClick={onClear}
              >
                <IconRefresh size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />
              </IconButton>
            </Tooltip>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
