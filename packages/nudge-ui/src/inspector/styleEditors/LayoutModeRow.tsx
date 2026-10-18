import { useState } from "react";
import type { ReactElement } from "react";
import { IconDots, IconLayoutColumns, IconLayoutGrid, IconLayoutRows, IconSquare } from "@tabler/icons-react";
import { GridAdvancedFields } from "./GridSection.tsx";
import { LayoutDropdown } from "./LayoutDropdown.tsx";
import { POSITION_OPTIONS, Z_INDEX_PRESETS } from "./PositionControls.tsx";
import { layoutModeEdits, layoutModeOf, type LayoutMode } from "./layoutMode.ts";
import { LayoutValueField, useComputedLayoutValue } from "./FlexControls.tsx";
import { inlineBlockedBy } from "./inlineAuthored.ts";
import { setStyles } from "../tokens/editActions.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { InspectorPopover } from "../ui/InspectorPopover.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { inlineStyleWarningContent } from "../ui/InlineStyleWarning.tsx";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";

const DISPLAY_OPTIONS = ["block", "inline", "inline-block", "flex", "inline-flex", "grid", "inline-grid", "none", "contents"];
const OVERFLOW_OPTIONS = ["visible", "hidden", "clip", "scroll", "auto"];
const FLEX_DIRECTION_OPTIONS = ["row", "row-reverse", "column", "column-reverse"];
const FLEX_WRAP_OPTIONS = ["nowrap", "wrap", "wrap-reverse"];
const ALIGN_ITEMS_OPTIONS = ["stretch", "flex-start", "center", "flex-end", "baseline"];
const ALIGN_CONTENT_OPTIONS = ["normal", "stretch", "flex-start", "flex-end", "center", "space-between", "space-around"];

const ICON_PROPS = { size: 16, stroke: 1.8, "aria-hidden": true } as const;
const MODE_OPTIONS = [
  { value: "block", label: "Block", icon: <IconSquare {...ICON_PROPS} />, testId: "layout-mode-block" },
  { value: "row", label: "Flex row", icon: <IconLayoutColumns {...ICON_PROPS} />, testId: "layout-mode-row" },
  { value: "column", label: "Flex column", icon: <IconLayoutRows {...ICON_PROPS} />, testId: "layout-mode-column" },
  { value: "grid", label: "Grid", icon: <IconLayoutGrid {...ICON_PROPS} />, testId: "layout-mode-grid" },
] as const satisfies ReadonlyArray<{ value: LayoutMode; label: string; icon: ReactElement; testId: string }>;

export interface LayoutModeRowProps {
  domElement: HTMLElement;
  editTarget?: EditTarget;
  selection?: StyleSelection | null;
  isFlexContainer: boolean;
  isGridContainer: boolean;
  revision?: number;
  onAfterEdit?: () => void;
}

/** One row picks how the element lays out its children; the rest of the display options sit behind the menu. */
export function LayoutModeRow(props: LayoutModeRowProps): ReactElement {
  return (
    <div className="layout__mode-row" data-test="layout-mode">
      <LayoutModeControl {...props} />
      <LayoutOptionsMenu {...props} />
    </div>
  );
}

function LayoutModeControl({ domElement, editTarget, selection, revision = 0, onAfterEdit }: LayoutModeRowProps): ReactElement {
  const [display] = useComputedLayoutValue(domElement, "display", "block", revision);
  const [direction] = useComputedLayoutValue(domElement, "flex-direction", "row", revision);
  const selectedDisplay = selection?.getProperty("display")?.value;
  const selectedDirection = selection?.getProperty("flex-direction")?.value;
  const sharedDisplay = selectedDisplay?.kind === "common" ? selectedDisplay.value : display;
  const sharedDirection = selectedDirection?.kind === "common" ? selectedDirection.value : direction;
  const mixedDisplay = selectedDisplay?.kind === "mixed";
  const mixedDirection = selectedDirection?.kind === "mixed" && sharedDisplay.endsWith("flex");
  const known = !mixedDisplay && !mixedDirection;
  const mode = known ? layoutModeOf(sharedDisplay, sharedDirection) : null;
  const blockedBy = inlineBlockedBy(selection?.domElements ?? [domElement], "display", "flex-direction");

  function selectMode(next: LayoutMode): void {
    if (blockedBy) return;
    const edits = layoutModeEdits(known ? { display: sharedDisplay, flexDirection: sharedDirection } : null, next);
    if (edits.length === 0) return;
    setStyles(editTarget ?? domElement, [...edits]);
    onAfterEdit?.();
  }

  return (
    <Tooltip content={inlineStyleWarningContent(blockedBy)} disabled={blockedBy === null}>
      <SegmentedControl
        value={mode}
        aria-label="Layout mode"
        data-test="layout-mode-control"
        className="layout__mode-control"
        disabled={blockedBy !== null}
        tooltips
        options={MODE_OPTIONS}
        onChange={selectMode}
      />
    </Tooltip>
  );
}

function LayoutOptionsMenu({
  domElement,
  editTarget,
  selection,
  isFlexContainer,
  isGridContainer,
  revision = 0,
  onAfterEdit,
}: LayoutModeRowProps): ReactElement {
  const [open, setOpen] = useState(false);
  const shared = { domElement, editTarget, selection, revision, onAfterEdit, stacked: true };

  return (
    <InspectorPopover
      data-test="layout-options"
      side="left"
      align="start"
      triggerTooltip="Layout options"
      triggerElement={(
        <IconButton variant="quiet" size="default" label="Layout options" data-active={open} data-test="layout-options">
          <IconDots size={16} stroke={2} aria-hidden="true" />
        </IconButton>
      )}
      open={open}
      onOpenChange={setOpen}
    >
      <div className="layout__options" data-test="layout-options-content">
        <div className="editor__title">Layout options</div>
        <div className="layout__options-pair">
          <LayoutDropdown property="display" options={DISPLAY_OPTIONS} {...shared} />
          <LayoutDropdown property="overflow" options={OVERFLOW_OPTIONS} {...shared} />
        </div>
        <div className="layout__options-pair">
          <LayoutDropdown property="position" options={POSITION_OPTIONS} {...shared} />
          <LayoutValueField label="Z-index" property="z-index" presets={Z_INDEX_PRESETS} inputOnly domElement={domElement} editTarget={editTarget} selection={selection} revision={revision} onAfterEdit={onAfterEdit} />
        </div>
        {isFlexContainer ? (
          <>
            <div className="layout__options-pair">
              <LayoutDropdown property="flex-direction" options={FLEX_DIRECTION_OPTIONS} {...shared} />
              <LayoutDropdown property="flex-wrap" options={FLEX_WRAP_OPTIONS} {...shared} />
            </div>
            <div className="layout__options-pair">
              <LayoutDropdown property="align-items" options={ALIGN_ITEMS_OPTIONS} {...shared} />
              <LayoutDropdown property="align-content" options={ALIGN_CONTENT_OPTIONS} {...shared} />
            </div>
          </>
        ) : null}
        {isGridContainer ? <GridAdvancedFields domElement={domElement} editTarget={editTarget} selection={selection} revision={revision} onAfterEdit={onAfterEdit} /> : null}
      </div>
    </InspectorPopover>
  );
}
