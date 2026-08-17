import type { ReactElement } from "react";
import { IconSpacingHorizontal, IconSpacingVertical } from "@tabler/icons-react";
import { GridPicker } from "./GridPicker.tsx";
import { LayoutComboField } from "./LayoutComboField.tsx";
import { LayoutDropdown } from "./LayoutDropdown.tsx";
import { GridValueField } from "./GridValueField.tsx";
import { ControlSurface } from "../ui/ControlSurface.tsx";

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
const GRID_SELF_ALIGNMENT_OPTIONS = ["auto", "normal", "stretch", "start", "end", "center", "self-start", "self-end"];
const GAP_PRESETS = ["0", "0.25rem", "0.5rem", "0.75rem", "1rem", "1.5rem", "2rem", "3rem"];

export interface GridSectionProps {
  domElement: HTMLElement;
  showContainer: boolean;
  showChild: boolean;
  revision?: number;
  onAfterEdit?: () => void;
}

export function GridSection({
  domElement: el,
  showContainer,
  showChild,
  revision = 0,
  onAfterEdit,
}: GridSectionProps): ReactElement {
  return (
    <>
      {showContainer ? <div className="dt-layout__group dt-layout__grid" data-test="layout-grid-container">
        <div className="dt-layout__grid-primary">
          <div className="dt-layout__grid-picker-column">
            <div className="dt-editor__title">Grid</div>
            <GridPicker domElement={el} revision={revision} onAfterEdit={onAfterEdit} />
          </div>
          <div className="dt-layout__grid-gap" data-test="layout-grid-gap">
            <div className="dt-editor__title">Gap</div>
            <div className="dt-layout__grid-gap-fields">
              <ControlSurface className="dt-layout__spacing-field" data-test="layout-grid-row-gap">
                <IconSpacingVertical
                  className="dt-layout__spacing-icon"
                  size="var(--dt-icon-size-small)"
                  stroke={1.8}
                  aria-hidden="true"
                  data-test="layout-spacing-icon-row-gap"
                />
                <LayoutComboField
                  property="row-gap"
                  presets={GAP_PRESETS}
                  domElement={el}
                  inputOnly
                  appearance="embedded"
                  revision={revision}
                  onAfterEdit={onAfterEdit}
                />
              </ControlSurface>
              <ControlSurface className="dt-layout__spacing-field" data-test="layout-grid-column-gap">
                <IconSpacingHorizontal
                  className="dt-layout__spacing-icon"
                  size="var(--dt-icon-size-small)"
                  stroke={1.8}
                  aria-hidden="true"
                  data-test="layout-spacing-icon-column-gap"
                />
                <LayoutComboField
                  property="column-gap"
                  presets={GAP_PRESETS}
                  domElement={el}
                  inputOnly
                  appearance="embedded"
                  revision={revision}
                  onAfterEdit={onAfterEdit}
                />
              </ControlSurface>
            </div>
          </div>
        </div>
        <details className="dt-layout__grid-advanced" data-test="layout-grid-advanced">
          <summary>Advanced grid CSS</summary>
          <div className="dt-layout__grid-fields">
            <GridValueField property="grid-template-columns" domElement={el} revision={revision} onAfterEdit={onAfterEdit} />
            <GridValueField property="grid-template-rows" domElement={el} revision={revision} onAfterEdit={onAfterEdit} />
            <LayoutDropdown
              property="grid-auto-flow"
              options={GRID_AUTO_FLOW_OPTIONS}
              domElement={el}
              revision={revision}
              onAfterEdit={onAfterEdit}
            />
            <GridValueField property="grid-auto-columns" domElement={el} revision={revision} onAfterEdit={onAfterEdit} />
            <GridValueField property="grid-auto-rows" domElement={el} revision={revision} onAfterEdit={onAfterEdit} />
          </div>
          <div className="dt-layout__grid-alignment" data-test="layout-grid-alignment">
            <LayoutDropdown
              property="justify-content"
              options={GRID_CONTENT_ALIGNMENT_OPTIONS}
              domElement={el}
              stacked
              revision={revision}
              onAfterEdit={onAfterEdit}
            />
            <LayoutDropdown
              property="align-content"
              options={GRID_CONTENT_ALIGNMENT_OPTIONS}
              domElement={el}
              stacked
              revision={revision}
              onAfterEdit={onAfterEdit}
            />
            <LayoutDropdown
              property="justify-items"
              options={GRID_ITEM_ALIGNMENT_OPTIONS}
              domElement={el}
              stacked
              revision={revision}
              onAfterEdit={onAfterEdit}
            />
            <LayoutDropdown
              property="align-items"
              options={GRID_ITEM_ALIGNMENT_OPTIONS}
              domElement={el}
              stacked
              revision={revision}
              onAfterEdit={onAfterEdit}
            />
          </div>
        </details>
      </div> : null}

      {showChild ? <div className="dt-layout__group dt-layout__grid-child" data-test="layout-grid-child">
        <div className="dt-editor__title">Grid Child</div>
        <GridValueField property="grid-column" domElement={el} revision={revision} onAfterEdit={onAfterEdit} />
        <GridValueField property="grid-row" domElement={el} revision={revision} onAfterEdit={onAfterEdit} />
        <LayoutDropdown
          property="justify-self"
          options={GRID_SELF_ALIGNMENT_OPTIONS}
          domElement={el}
          revision={revision}
          onAfterEdit={onAfterEdit}
        />
        <LayoutDropdown
          property="align-self"
          options={GRID_SELF_ALIGNMENT_OPTIONS}
          domElement={el}
          revision={revision}
          onAfterEdit={onAfterEdit}
        />
      </div> : null}
    </>
  );
}
