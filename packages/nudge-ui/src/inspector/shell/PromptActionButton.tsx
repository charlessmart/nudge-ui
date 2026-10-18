import { forwardRef, type ReactElement, type ReactNode } from "react";
import { IconChevronDown, IconCopy, IconX } from "@tabler/icons-react";
import { Button, type ButtonProps } from "../ui/Button.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";

export interface PromptActionButtonProps extends ButtonProps {
  readonly copied?: boolean;
  readonly agentState?: string;
  readonly busy?: boolean;
  readonly icon?: ReactNode;
  readonly label?: ReactNode;
  readonly badgeCount?: number;
  readonly hasMenu?: boolean;
}

/** Presents a prompt action without owning clipboard or agent connections. */
export const PromptActionButton = forwardRef<HTMLButtonElement, PromptActionButtonProps>(function PromptActionButton({
  copied = false, agentState = "disconnected", busy = false,
  icon = <IconCopy size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />,
  label = "Copy prompt", badgeCount = 0, hasMenu = false, ...props
}, ref) {
  return <Button
    ref={ref} variant="primary" className="copy-prompt__main" data-test="copy-prompt" type="button"
    data-copied={copied ? "true" : "false"} data-agent-state={agentState}
    aria-busy={busy ? "true" : undefined} {...props}
  >
    {icon}{label}
    {badgeCount > 0 ? <span className="copy-prompt__change-count" data-test="copy-prompt-change-count">{badgeCount}</span> : null}
    {hasMenu ? <IconChevronDown size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" /> : null}
  </Button>;
});

export interface PromptActionRowProps {
  readonly children: ReactNode;
  /** Clears the pending changes; the close button appears over the action while there are any. */
  readonly onClear?: () => void;
  readonly hasChanges?: boolean;
  readonly hasMenu?: boolean;
}

/** A prompt action with a close button that fades in over it on hover, like the sketch delete in the menu. */
export function PromptActionRow({ children, onClear, hasChanges = false, hasMenu = false }: PromptActionRowProps): ReactElement {
  return (
    <div className="copy-prompt__row" data-has-menu={hasMenu ? "true" : undefined}>
      {children}
      {onClear && hasChanges ? (
        <Tooltip>
          <IconButton
            className="copy-prompt__clear"
            variant="quiet"
            size="compact"
            label="Clear changes"
            data-test="copy-prompt-clear"
            onClick={onClear}
          >
            <IconX size="var(--icon-size-small)" aria-hidden="true" />
          </IconButton>
        </Tooltip>
      ) : null}
    </div>
  );
}
