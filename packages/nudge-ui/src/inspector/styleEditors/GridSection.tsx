import type { ReactElement } from "react";
import { IconSpacingHorizontal, IconSpacingVertical } from "@tabler/icons-react";
import { GridPicker } from "./GridPicker.tsx";
import { GapField } from "./GapField.tsx";
import { LayoutDropdown } from "./LayoutDropdown.tsx";
import { GridValueField } from "./GridValueField.tsx";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import type { ResolvedProperty, TokenEntry } from "../../css/model/index.ts";
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
const GRID_ALIGNMENT_FIELDS = [
  { property: "justify-content", options: GRID_CONTENT_ALIGNMENT_OPTIONS },
  { property: "align-content", options: GRID_CONTENT_ALIGNMENT_OPTIONS },
  { property: "justify-items", options: GRID_ITEM_ALIGNMENT_OPTIONS },
  { property: "align-items", options: GRID_ITEM_ALIGNMENT_OPTIONS },
] as const;
const GRID_TRACK_PROPERTIES = ["grid-template-columns", "grid-template-rows"] as const;
const GRID_AUTO_TRACK_PROPERTIES = ["grid-auto-columns", "grid-auto-rows"] as const;

export interface GridControlProps {
  domElement: HTMLElement;
  editTarget?: EditTarget;
  selection?: StyleSelection | null;
  revision?: number;
  onAfterEdit?: () => void;
}

export interface GridContainerControlsProps extends GridControlProps {
  entries: TokenEntry[];
  tokenRows: ResolvedProperty[];
}

/** Track templates, flow and content alignment: the grid container settings the cell picker does not cover. */
export function GridAdvancedFields({
  domElement,
  editTarget,
  selection,
  revision = 0,
  onAfterEdit,
}: GridControlProps): ReactElement {
  const shared = { domElement, editTarget, selection, revision, onAfterEdit };
  return (
    <div className="layout__grid-advanced" data-test="layout-grid-advanced">
      <div className="editor__title">Advanced grid CSS</div>
      <div className="layout__grid-fields">
        {GRID_TRACK_PROPERTIES.map((property) => <GridValueField key={property} property={property} {...shared} />)}
        <LayoutDropdown property="grid-auto-flow" options={GRID_AUTO_FLOW_OPTIONS} {...shared} />
        {GRID_AUTO_TRACK_PROPERTIES.map((property) => <GridValueField key={property} property={property} {...shared} />)}
      </div>
      <div className="layout__grid-alignment" data-test="layout-grid-alignment">
        {GRID_ALIGNMENT_FIELDS.map(({ property, options }) => (
          <LayoutDropdown key={property} property={property} options={[...options]} stacked {...shared} />
        ))}
      </div>
    </div>
  );
}

/** The cell picker beside the row and column gap fields. */
export function GridContainerControls({
  domElement,
  editTarget,
  selection,
  entries,
  tokenRows,
  revision = 0,
  onAfterEdit,
}: GridContainerControlsProps): ReactElement {
  const gaps = [
    { property: "row-gap", Icon: IconSpacingVertical },
    { property: "column-gap", Icon: IconSpacingHorizontal },
  ] as const;
  return (
    <div className="layout__grid-primary" data-test="layout-grid-container">
      <GridPicker domElement={domElement} editTarget={editTarget} revision={revision} onAfterEdit={onAfterEdit} />
      <div className="layout__grid-gap-fields" data-test="layout-grid-gap">
        {gaps.map(({ property, Icon }) => (
          <ControlSurface key={property} className="layout__spacing-field" data-test={`layout-grid-${property}`}>
            <GapField
              property={property}
              domElement={domElement}
              editTarget={editTarget}
              selection={selection}
              entries={entries}
              tokenRows={tokenRows}
              leading={(
                <Icon
                  className="layout__spacing-icon"
                  size="var(--icon-size-small)"
                  stroke={1.8}
                  aria-hidden="true"
                  data-test={`layout-spacing-icon-${property}`}
                />
              )}
              onAfterEdit={onAfterEdit}
            />
          </ControlSurface>
        ))}
      </div>
    </div>
  );
}
