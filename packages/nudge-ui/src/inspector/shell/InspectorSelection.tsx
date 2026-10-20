import type { ReactElement, ReactNode } from "react";
import type { InteractionState } from "./styleState.ts";
import { StatusCallout } from "../ui/StatusCallout.tsx";
import { IconLink, IconSquareRotated, IconUnlink } from "@tabler/icons-react";
import { IconButton } from "../ui/IconButton.tsx";
import { FieldRow } from "../ui/FieldRow.tsx";
import { Select } from "../ui/Select.tsx";
import { formatInspectorLabel } from "../ui/labels.ts";
import type { ElementName } from "./elementName.ts";

export interface InspectorSelectionProps {
  readonly identity?: { readonly cid: string; readonly src: string };
  readonly count: number;
  readonly name: ElementName | null;
  /** The selection has editable component props, which links it like a shared source site does. */
  readonly isComponent?: boolean;
  /** Component props, shown between the name and the link status. */
  readonly children?: ReactNode;
  readonly editScope: "source-site" | "rendered-instance" | null;
  readonly sourceSiteMatchCount: number;
  readonly styleState: InteractionState;
  readonly availableInteractionStates: readonly InteractionState[];
  readonly onStyleStateChange: (state: InteractionState) => void;
  readonly onRelink: () => void;
  readonly onUnlink: () => void;
}

/** Presents selection scope and interaction states without reading the DOM. */
export function InspectorSelection({ identity, count, name, isComponent = false, children, editScope, sourceSiteMatchCount, styleState, availableInteractionStates, onStyleStateChange, onRelink, onUnlink }: InspectorSelectionProps): ReactElement {
  const showInteractionState = count === 1 && availableInteractionStates.length > 1;
  const hasEditScopeCallout = count === 1 && (editScope === "rendered-instance" || sourceSiteMatchCount > 1);
  return <>
    {name || children || showInteractionState || hasEditScopeCallout ? (
      <div
        className={`selection${hasEditScopeCallout ? "" : " selection--without-scope-callout"}`}
        data-test="selection"
        data-selected-cid={identity?.cid}
        data-selected-src={identity?.src}
        data-selected-count={count}
      >
        {name ? (
          <div className="editor__title-row selection__name" data-test="selection-name">
            {isComponent || (hasEditScopeCallout && editScope === "source-site") ? (
              <IconSquareRotated className="selection__linked-icon" size={14} stroke={2} aria-hidden="true" data-test="selection-linked-icon" />
            ) : null}
            <div className="editor__title">{name.title}</div>
            {hasEditScopeCallout ? (
              <StatusCallout
                tone={editScope === "rendered-instance" ? "neutral" : "accent"}
                className="selection__scope"
                data-test="edit-scope"
                data-lost="false"
              >
                {editScope === "rendered-instance" ? (
                  <div className="scope__unlinked">
                    <span>Unlinked</span>
                    <IconButton
                      variant="quiet"
                      label="Relink element"
                      className="scope__action"
                      data-test="relink-element"
                      onClick={onRelink}
                    >
                      <IconLink size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
                    </IconButton>
                  </div>
                ) : (
                  <div className="scope__linked">
                    <span>Linked ({sourceSiteMatchCount})</span>
                    <IconButton
                      variant="quiet"
                      label="Unlink element"
                      data-test="unlink-element"
                      onClick={onUnlink}
                    >
                      <IconUnlink size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
                    </IconButton>
                  </div>
                )}
              </StatusCallout>
            ) : null}
          </div>
        ) : null}
        {children}
        {showInteractionState ? (
          <FieldRow label="State" className="style-state" data-test="style-state">
            <Select
              value={styleState}
              data-test="style-state-select"
              aria-label="Style State"
              options={availableInteractionStates.map((state) => ({
                value: state,
                label: formatInspectorLabel(state),
              }))}
              onValueChange={(state) => {
                const next = availableInteractionStates.find((candidate) => candidate === state);
                if (next) onStyleStateChange(next);
              }}
            />
          </FieldRow>
        ) : null}
      </div>
    ) : null}
  </>;
}
