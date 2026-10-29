import { useRef } from "react";
import type { ReactElement, ReactNode } from "react";
import { IconLayoutSidebarRight } from "@tabler/icons-react";
import { IconButton } from "../ui/IconButton.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { NudgeLogoIcon } from "./NudgeLogoIcon.tsx";
import { PanelResizeHandle } from "./PanelResizeHandle.tsx";

export interface InspectorPanelProps {
  readonly isOpen: boolean;
  readonly collapseDisabled?: boolean;
  readonly toggleShortcut?: string;
  readonly headerActions: ReactNode;
  readonly prompt: ReactNode;
  /** Switches what the panel body shows, under the prompt row. */
  readonly views?: ReactNode;
  readonly children: ReactNode;
  readonly onOpenChange: (open: boolean) => void;
}

/** Shared panel layout. The host supplies state, content, and commands. */
export function InspectorPanel({ isOpen, collapseDisabled, toggleShortcut, headerActions, prompt, views, children, onOpenChange }: InspectorPanelProps): ReactElement {
  const panelRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <div className="panel" data-open={isOpen ? "true" : "false"} ref={panelRef}>
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
          {views ? <div className="panel__views">{views}</div> : null}
        </div>
        <div className="panel__body">
          {children}
        </div>
      </div>
      {isOpen ? <PanelResizeHandle panelRef={panelRef} /> : null}
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
              <NudgeLogoIcon />
            </IconButton>
          </Tooltip>
        </div>
      ) : null}
    </>
  );
}
