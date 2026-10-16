import type { ReactElement } from "react";
import type { InteractionState } from "./styleState.ts";
import { StatusCallout } from "../ui/StatusCallout.tsx";
import { Button } from "../ui/Button.tsx";
import { FieldRow } from "../ui/FieldRow.tsx";
import { Select } from "../ui/Select.tsx";
import { formatInspectorLabel } from "../ui/labels.ts";

export interface InspectorSelectionProps {
  readonly identity?: { readonly cid: string; readonly src: string };
  readonly count: number;
  readonly editScope: "source-site" | "rendered-instance" | null;
  readonly sourceSiteMatchCount: number;
  readonly styleState: InteractionState;
  readonly availableInteractionStates: readonly InteractionState[];
  readonly onStyleStateChange: (state: InteractionState) => void;
  readonly onRelink: () => void;
  readonly onUnlink: () => void;
}

/** Presents selection scope and interaction states without reading the DOM. */
export function InspectorSelection({ identity, count, editScope, sourceSiteMatchCount, styleState, availableInteractionStates, onStyleStateChange, onRelink, onUnlink }: InspectorSelectionProps): ReactElement {
  const showInteractionState = count === 1 && availableInteractionStates.length > 1;
  const hasEditScopeCallout = count === 1 && (editScope === "rendered-instance" || sourceSiteMatchCount > 1);
  return <>
    {showInteractionState || hasEditScopeCallout ? (
      <div
        className={`selection${hasEditScopeCallout ? "" : " selection--without-scope-callout"}`}
        data-test="selection"
        data-selected-cid={identity?.cid}
        data-selected-src={identity?.src}
        data-selected-count={count}
      >
        {hasEditScopeCallout ? (
          <StatusCallout
            tone={editScope === "rendered-instance" ? "neutral" : "accent"}
            data-test="edit-scope"
            data-lost="false"
          >
            {editScope === "rendered-instance" ? (
              <div className="scope__unlinked">
                <span>Element unlinked</span>
                <Button
                  size="compact"
                  className="scope__action"
                  data-test="relink-element"
                  onClick={onRelink}
                >
                  Relink
                </Button>
              </div>
            ) : (
              <div className="scope__linked">
                <span>Affects {sourceSiteMatchCount} elements.</span>
                <Button
                  size="compact"
                  variant="quiet"
                  data-test="unlink-element"
                  onClick={onUnlink}
                >
                  Unlink
                </Button>
              </div>
            )}
          </StatusCallout>
        ) : null}
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
