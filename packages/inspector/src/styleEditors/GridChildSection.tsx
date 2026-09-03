import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { IconSettings } from "@tabler/icons-react";
import { Button } from "../ui/Button.tsx";
import { FieldRow } from "../ui/FieldRow.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { InspectorPopover } from "../ui/InspectorPopover.tsx";
import { Select } from "../ui/Select.tsx";
import { Stepper } from "../ui/Stepper.tsx";
import { formatInspectorLabel } from "../ui/labels.ts";
import { GridValueField } from "./GridValueField.tsx";
import { LayoutDropdown } from "./LayoutDropdown.tsx";
import {
  GRID_CHILD_ALIGNMENT_OPTIONS,
  GRID_CHILD_MAX_TRACKS,
  commitGridAxisPlacement,
  commitGridChildAlignment,
  commitGridChildQuickAction,
  parentTrackCount,
  readGridAxisPlacement,
  readGridChildAlignment,
  readGridChildQuickActionState,
  startLineOptions,
  type GridAxis,
  type GridAxisPlacement,
  type GridChildQuickAction,
  type GridChildQuickActionState,
} from "./gridChildModel.ts";

/** Full CSS self-alignment keyword set for the advanced raw editors. */
const GRID_CHILD_SELF_ALIGNMENT_OPTIONS = ["auto", "normal", "stretch", "start", "end", "center", "self-start", "self-end"];

export interface GridChildSectionProps {
  domElement: HTMLElement;
  revision?: number;
  onAfterEdit?: () => void;
}

interface AxisState {
  placement: GridAxisPlacement;
  tracks: number | null;
}

function readAxis(el: HTMLElement, axis: GridAxis): AxisState {
  return { placement: readGridAxisPlacement(el, axis), tracks: parentTrackCount(el, axis) };
}

const QUICK_ACTIONS: Array<{ action: GridChildQuickAction; label: string; stateKey: keyof GridChildQuickActionState }> = [
  { action: "full-width", label: "Full width", stateKey: "fullWidth" },
  { action: "full-height", label: "Full height", stateKey: "fullHeight" },
  { action: "center", label: "Center in cell", stateKey: "centered" },
  { action: "fill", label: "Fill cell", stateKey: "filled" },
];

function alignmentOptions(current: string): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = GRID_CHILD_ALIGNMENT_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
  }));
  if (!options.some((option) => option.value === current)) {
    options.push({ value: current, label: formatInspectorLabel(current) });
  }
  return options;
}

interface AxisPlacementRowProps {
  axis: GridAxis;
  label: string;
  state: AxisState;
  onStart: (start: string) => void;
  onSpan: (span: number) => void;
}

function AxisPlacementRow({ axis, label, state, onStart, onSpan }: AxisPlacementRowProps): ReactElement {
  const startValue = state.placement.start;
  const startOptions = startLineOptions(state.tracks);
  const allStartOptions = startOptions.some((option) => option.value === startValue)
    ? startOptions
    : [...startOptions, { value: startValue, label: startValue }];

  return (
    <FieldRow label={label} data-test={`layout-grid-child-${axis}`}>
      <div className="layout__grid-child-axis">
        <Select
          data-test={`layout-grid-child-${axis}-start`}
          value={startValue}
          options={allStartOptions}
          aria-label={`${label} start line`}
          onValueChange={onStart}
        />
        <Stepper
          data-test={`layout-grid-child-${axis}-span`}
          ariaLabel={`${label} span`}
          prefix="×"
          value={state.placement.span}
          min={1}
          max={state.tracks ?? GRID_CHILD_MAX_TRACKS}
          onChange={onSpan}
        />
      </div>
    </FieldRow>
  );
}

/**
 * Grid child controls expressed in design vocabulary: placement as
 * "start line + span" per axis, friendly self-alignment labels, and one-click
 * quick actions. All edits commit as managed longhand CSS declarations; raw
 * shorthand editing stays available in the advanced popover.
 */
export function GridChildSection({
  domElement: el,
  revision = 0,
  onAfterEdit,
}: GridChildSectionProps): ReactElement {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [column, setColumn] = useState<AxisState>(() => readAxis(el, "column"));
  const [row, setRow] = useState<AxisState>(() => readAxis(el, "row"));
  const [alignH, setAlignH] = useState(() => readGridChildAlignment(el, "h"));
  const [alignV, setAlignV] = useState(() => readGridChildAlignment(el, "v"));
  const [quick, setQuick] = useState<GridChildQuickActionState>(() => readGridChildQuickActionState(el));

  useEffect(() => {
    setColumn(readAxis(el, "column"));
    setRow(readAxis(el, "row"));
    setAlignH(readGridChildAlignment(el, "h"));
    setAlignV(readGridChildAlignment(el, "v"));
    setQuick(readGridChildQuickActionState(el));
  }, [el, revision]);

  function handleAfterEdit(): void {
    onAfterEdit?.();
  }

  function handleStart(axis: GridAxis, start: string): void {
    if (commitGridAxisPlacement(el, axis, { start, span: "keep" }).length > 0) handleAfterEdit();
  }

  function handleSpan(axis: GridAxis, span: number): void {
    if (commitGridAxisPlacement(el, axis, { span }).length > 0) handleAfterEdit();
  }

  function handleAlignment(axis: "h" | "v", value: string): void {
    if (commitGridChildAlignment(el, axis, value).length > 0) handleAfterEdit();
  }

  function handleQuickAction(action: GridChildQuickAction): void {
    if (commitGridChildQuickAction(el, action).length > 0) handleAfterEdit();
  }

  return (
    <div className="layout__group layout__grid-child" data-test="layout-grid-child">
      <div className="layout__grid-child-heading">
        <div className="editor__title">Grid Child</div>
        <InspectorPopover
          data-test="layout-grid-child-settings"
          side="bottom"
          align="end"
          triggerElement={(
            <IconButton
              variant="quiet"
              size="default"
              label="Grid child settings"
              title="Grid child settings"
              data-active={advancedOpen}
              data-test="layout-grid-child-settings"
            >
              <IconSettings size={16} stroke={1.8} aria-hidden="true" />
            </IconButton>
          )}
          open={advancedOpen}
          onOpenChange={setAdvancedOpen}
        >
          <div className="layout__grid-child-advanced" data-test="layout-grid-child-advanced">
            <div className="layout__grid-advanced-title">Advanced grid CSS</div>
            <GridValueField property="grid-column" domElement={el} revision={revision} onAfterEdit={onAfterEdit} />
            <GridValueField property="grid-row" domElement={el} revision={revision} onAfterEdit={onAfterEdit} />
            <div className="layout__grid-alignment" data-test="layout-grid-child-advanced-alignment">
              <LayoutDropdown
                property="justify-self"
                options={GRID_CHILD_SELF_ALIGNMENT_OPTIONS}
                domElement={el}
                stacked
                revision={revision}
                onAfterEdit={onAfterEdit}
              />
              <LayoutDropdown
                property="align-self"
                options={GRID_CHILD_SELF_ALIGNMENT_OPTIONS}
                domElement={el}
                stacked
                revision={revision}
                onAfterEdit={onAfterEdit}
              />
            </div>
          </div>
        </InspectorPopover>
      </div>

      <AxisPlacementRow axis="column" label="Column" state={column} onStart={(start) => handleStart("column", start)} onSpan={(span) => handleSpan("column", span)} />
      <AxisPlacementRow axis="row" label="Row" state={row} onStart={(start) => handleStart("row", start)} onSpan={(span) => handleSpan("row", span)} />

      <div className="layout__grid-child-actions" data-test="layout-grid-child-actions">
        {QUICK_ACTIONS.map(({ action, label, stateKey }) => {
          const active = quick[stateKey];
          return (
            <Button
              key={action}
              variant="secondary"
              size="compact"
              data-active={active ? "true" : undefined}
              aria-pressed={active}
              data-test={`layout-grid-child-action-${action}`}
              onClick={() => handleQuickAction(action)}
            >
              {label}
            </Button>
          );
        })}
      </div>

      <div className="layout__grid-child-alignment" data-test="layout-grid-child-alignment">
        <FieldRow label="Horizontal" className="field-row--stacked" data-test="layout-grid-child-align-h">
          <Select
            data-test="layout-grid-child-select-justify-self"
            value={alignH}
            options={alignmentOptions(alignH)}
            aria-label="Horizontal alignment"
            onValueChange={(value) => handleAlignment("h", value)}
          />
        </FieldRow>
        <FieldRow label="Vertical" className="field-row--stacked" data-test="layout-grid-child-align-v">
          <Select
            data-test="layout-grid-child-select-align-self"
            value={alignV}
            options={alignmentOptions(alignV)}
            aria-label="Vertical alignment"
            onValueChange={(value) => handleAlignment("v", value)}
          />
        </FieldRow>
      </div>
    </div>
  );
}
