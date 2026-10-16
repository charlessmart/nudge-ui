import type { ReactElement, ReactNode } from "react";
import { IconLayoutSidebarRight } from "@tabler/icons-react";
import { IconButton } from "../ui/IconButton.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";

export interface InspectorPanelProps {
  readonly isOpen: boolean;
  readonly collapseDisabled?: boolean;
  readonly toggleShortcut?: string;
  readonly headerActions: ReactNode;
  readonly prompt: ReactNode;
  readonly children: ReactNode;
  readonly onOpenChange: (open: boolean) => void;
}

/** Shared panel layout. The host supplies state, content, and commands. */
export function InspectorPanel({ isOpen, collapseDisabled, toggleShortcut, headerActions, prompt, children, onOpenChange }: InspectorPanelProps): ReactElement {
  return (
    <>
      <div className="panel" data-open={isOpen ? "true" : "false"}>
        <div className="panel__tabs" aria-label="Inspector controls">
          <div
            className="panel__header-row"
            data-test="inspect-tab"
          >
            <Tooltip content="Hide inspector" shortcut={toggleShortcut} stableTrigger>
              <IconButton
                variant="quiet"
                label="Collapse inspector"
                data-test="collapse-inspector"
                disabled={collapseDisabled}
                style={{ marginLeft: "calc(var(--space-8) * -1)" }}
                onClick={() => onOpenChange(false)}
              >
                <IconLayoutSidebarRight size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
              </IconButton>
            </Tooltip>
            <div className="panel__header-actions">
              {headerActions}
            </div>
          </div>
          <div className="panel__copy-row">
            {prompt}
          </div>
        </div>
        <div className="panel__body">
          {children}
        </div>
      </div>
      {!isOpen ? (
        <div className="panel__restore">
          <Tooltip>
            <IconButton
              variant="quiet"
              label="Show inspector"
              className="panel__restore-button"
              data-test="show-inspector"
              onClick={() => onOpenChange(true)}
            >
              <IconLayoutSidebarRight size="var(--icon-size-small)" stroke={"var(--icon-stroke-width)"} aria-hidden="true" />
            </IconButton>
          </Tooltip>
        </div>
      ) : null}
    </>
  );
}
