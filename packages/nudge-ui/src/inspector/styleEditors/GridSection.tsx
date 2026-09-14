import { useState } from "react";
import type { ReactElement } from "react";
import { IconSettings, IconSpacingHorizontal, IconSpacingVertical } from "@tabler/icons-react";
import { GridPicker } from "./GridPicker.tsx";
import { GapField } from "./GapField.tsx";
import { LayoutDropdown } from "./LayoutDropdown.tsx";
import { GridValueField } from "./GridValueField.tsx";
import { GridChildSection } from "./GridChildSection.tsx";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { InspectorPopover } from "../ui/InspectorPopover.tsx";
import type { TokenEntry } from "../../css/model/index.ts";
import type { ResolvedProperty } from "../../css/model/index.ts";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";

const GRID_AUTO_FLOW_OPTIONS = ["row", "column", "row dense", "column dense"];
const GRID_CONTENT_ALIGNMENT_OPTIONS = [
  "normal",
  "start",
  "end",
  "center",
  "stretch",
  "space-between",
  "space-around",
  "space-evenly",
];
const GRID_ITEM_ALIGNMENT_OPTIONS = ["normal", "stretch", "start", "end", "center", "self-start", "self-end"];
export interface GridSectionProps {
  domElement: HTMLElement;
  editTarget?: EditTarget;
  selection?: StyleSelection | null;
  entries: TokenEntry[];
  tokenRows: ResolvedProperty[];
  showContainer: boolean;
  showChild: boolean;
  revision?: number;
  onAfterEdit?: () => void;
}

export function GridSection({
  domElement: el,
  editTarget,
  selection,
  entries,
  tokenRows,
  showContainer,
  showChild,
  revision = 0,
  onAfterEdit,
}: GridSectionProps): ReactElement {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <>
      {showContainer ? <div className="layout__group layout__grid" data-test="layout-grid-container">
        <div className="layout__grid-primary">
          <div className="layout__grid-picker-column">
            <div className="layout__grid-heading">
              <div className="editor__title">Grid</div>
              <InspectorPopover
                data-test="layout-grid-settings"
                side="bottom"
                align="end"
                triggerElement={(
                  <IconButton
                    variant="quiet"
                    size="default"
                    label="Grid settings"
                    title="Grid settings"
                    data-active={advancedOpen}
                    data-test="layout-grid-settings"
                  >
                    <IconSettings size={16} stroke={1.8} aria-hidden="true" />
                  </IconButton>
                )}
                open={advancedOpen}
                onOpenChange={setAdvancedOpen}
              >
                <div className="layout__grid-advanced" data-test="layout-grid-advanced">
                  <div className="editor__title">Advanced grid CSS</div>
                  <div className="layout__grid-fields">
                    <GridValueField property="grid-template-columns" domElement={el} editTarget={editTarget} selection={selection} revision={revision} onAfterEdit={onAfterEdit} />
                    <GridValueField property="grid-template-rows" domElement={el} editTarget={editTarget} selection={selection} revision={revision} onAfterEdit={onAfterEdit} />
                    <LayoutDropdown
                      property="grid-auto-flow"
                      options={GRID_AUTO_FLOW_OPTIONS}
                      domElement={el}
                      editTarget={editTarget}
                      selection={selection}
                      revision={revision}
                      onAfterEdit={onAfterEdit}
                    />
                    <GridValueField property="grid-auto-columns" domElement={el} editTarget={editTarget} selection={selection} revision={revision} onAfterEdit={onAfterEdit} />
                    <GridValueField property="grid-auto-rows" domElement={el} editTarget={editTarget} selection={selection} revision={revision} onAfterEdit={onAfterEdit} />
                  </div>
                  <div className="layout__grid-alignment" data-test="layout-grid-alignment">
                    <LayoutDropdown
                      property="justify-content"
                      options={GRID_CONTENT_ALIGNMENT_OPTIONS}
                      domElement={el}
                      editTarget={editTarget}
                      selection={selection}
                      stacked
                      revision={revision}
                      onAfterEdit={onAfterEdit}
                    />
                    <LayoutDropdown
                      property="align-content"
                      options={GRID_CONTENT_ALIGNMENT_OPTIONS}
                      domElement={el}
                      editTarget={editTarget}
                      selection={selection}
                      stacked
                      revision={revision}
                      onAfterEdit={onAfterEdit}
                    />
                    <LayoutDropdown
                      property="justify-items"
                      options={GRID_ITEM_ALIGNMENT_OPTIONS}
                      domElement={el}
                      editTarget={editTarget}
                      selection={selection}
                      stacked
                      revision={revision}
                      onAfterEdit={onAfterEdit}
                    />
                    <LayoutDropdown
                      property="align-items"
                      options={GRID_ITEM_ALIGNMENT_OPTIONS}
                      domElement={el}
                      editTarget={editTarget}
                      selection={selection}
                      stacked
                      revision={revision}
                      onAfterEdit={onAfterEdit}
                    />
                  </div>
                </div>
              </InspectorPopover>
            </div>
            <GridPicker domElement={el} editTarget={editTarget} revision={revision} onAfterEdit={onAfterEdit} />
          </div>
          <div className="layout__grid-gap" data-test="layout-grid-gap">
            <div className="editor__title">Gap</div>
            <div className="layout__grid-gap-fields">
              <ControlSurface className="layout__spacing-field" data-test="layout-grid-row-gap">
                <IconSpacingVertical
                  className="layout__spacing-icon"
                  size="var(--icon-size-small)"
                  stroke={1.8}
                  aria-hidden="true"
                  data-test="layout-spacing-icon-row-gap"
                />
                <GapField
                  property="row-gap"
                  domElement={el}
                  editTarget={editTarget}
                  selection={selection}
                  entries={entries}
                  tokenRows={tokenRows}
                  onAfterEdit={onAfterEdit}
                />
              </ControlSurface>
              <ControlSurface className="layout__spacing-field" data-test="layout-grid-column-gap">
                <IconSpacingHorizontal
                  className="layout__spacing-icon"
                  size="var(--icon-size-small)"
                  stroke={1.8}
                  aria-hidden="true"
                  data-test="layout-spacing-icon-column-gap"
                />
                <GapField
                  property="column-gap"
                  domElement={el}
                  editTarget={editTarget}
                  selection={selection}
                  entries={entries}
                  tokenRows={tokenRows}
                  onAfterEdit={onAfterEdit}
                />
              </ControlSurface>
            </div>
          </div>
        </div>
      </div> : null}

      {showChild ? <GridChildSection domElement={el} editTarget={editTarget} revision={revision} onAfterEdit={onAfterEdit} /> : null}
    </>
  );
}
