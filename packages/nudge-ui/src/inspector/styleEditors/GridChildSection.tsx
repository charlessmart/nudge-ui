import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import {
  IconAlignBoxCenterBottom,
  IconAlignBoxCenterMiddle,
  IconAlignBoxCenterStretch,
  IconAlignBoxCenterTop,
  IconAlignBoxLeftMiddle,
  IconAlignBoxRightMiddle,
  IconColumns2,
  IconLayoutRows,
} from "@tabler/icons-react";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import { FieldRow } from "../ui/FieldRow.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { TextInput } from "../ui/TextInput.tsx";
import { useValueDraft } from "./valueField.ts";
import { InlineStyleBlockedTooltip, InlineStyleWarning } from "../ui/InlineStyleWarning.tsx";
import {
  commitGridAxisPlacement,
  commitGridChildAlignment,
  readGridAxisPlacement,
  readGridChildAlignment,
  type GridAxis,
  type GridAxisPlacement,
} from "./gridChildModel.ts";
import { targetElements, type EditTarget } from "../selection/editTarget.ts";
import { inlineBlockedBy } from "./inlineAuthored.ts";

export interface GridChildSectionProps {
  domElement: HTMLElement;
  editTarget?: EditTarget;
  revision?: number;
  onAfterEdit?: () => void;
  /** Drops the group rule and title so the fields can sit inside another panel, such as the layout options menu. */
  bare?: boolean;
}

interface AxisState {
  placement: GridAxisPlacement;
}

function readAxis(el: HTMLElement, axis: GridAxis): AxisState {
  return { placement: readGridAxisPlacement(el, axis) };
}

interface AxisPlacementRowProps {
  axis: GridAxis;
  label: string;
  state: AxisState;
  elements: readonly HTMLElement[];
  onStart: (start: string) => void;
}

function AxisPlacementRow({ axis, label, state, elements, onStart }: AxisPlacementRowProps): ReactElement {
  const blockedBy = inlineBlockedBy(elements, `grid-${axis}-start`, `grid-${axis}-end`);
  const field = useValueDraft({
    value: state.placement.start,
    mixed: false,
    blocked: blockedBy !== null,
    property: `grid-${axis}-start`,
    resetKey: elements,
    emptyValue: "auto",
    onCommit: (next) => {
      if (next !== state.placement.start) onStart(next);
    },
    commitOnNudge: true,
  });

  const AxisIcon = axis === "column" ? IconColumns2 : IconLayoutRows;

  return (
    <FieldRow
      label={label}
      className={`field-row--stacked layout__grid-child-placement layout__grid-child-placement--${axis}`}
      data-test={`layout-grid-child-${axis}`}
    >
      <ControlSurface>
        <AxisIcon
          className="layout__grid-child-placement-icon"
          size="var(--icon-size-small)"
          stroke="var(--icon-stroke-width)"
          aria-hidden="true"
        />
        <TextInput
          appearance="embedded"
          value={field.draft}
          data-test={`layout-grid-child-${axis}-start`}
          aria-label={label}
          disabled={blockedBy !== null}
          onChange={(event) => field.setDraft(event.target.value)}
          onBlur={field.handleBlur}
          onKeyDown={field.handleKeyDown}
        />
        <InlineStyleWarning blockedBy={blockedBy} />
      </ControlSurface>
    </FieldRow>
  );
}

interface AlignmentControlProps {
  axis: "h" | "v";
  value: string;
  elements: readonly HTMLElement[];
  onChange: (value: string) => void;
}

function AlignmentControl({ axis, value, elements, onChange }: AlignmentControlProps): ReactElement {
  const horizontal = axis === "h";
  const property = horizontal ? "justify-self" : "align-self";
  const blockedBy = inlineBlockedBy(elements, property);
  const options = horizontal
    ? [
      { value: "start", label: "Align left", icon: <IconAlignBoxLeftMiddle size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" /> },
      { value: "center", label: "Align center", icon: <IconAlignBoxCenterMiddle size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" /> },
      { value: "end", label: "Align right", icon: <IconAlignBoxRightMiddle size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" /> },
      { value: "stretch", label: "Stretch horizontally", icon: <IconAlignBoxCenterStretch className="layout__grid-child-align-icon--horizontal" size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" /> },
    ]
    : [
      { value: "start", label: "Align top", icon: <IconAlignBoxCenterTop size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" /> },
      { value: "center", label: "Align middle", icon: <IconAlignBoxCenterMiddle size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" /> },
      { value: "end", label: "Align bottom", icon: <IconAlignBoxCenterBottom size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" /> },
      { value: "stretch", label: "Stretch vertically", icon: <IconAlignBoxCenterStretch size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" /> },
    ];

  return (
    <FieldRow
      label={horizontal ? "Horizontal alignment" : "Vertical alignment"}
      hideLabel
      className={`field-row--stacked layout__grid-child-alignment layout__grid-child-alignment--${axis}`}
      data-test={`layout-grid-child-align-${axis}`}
    >
      <InlineStyleBlockedTooltip blockedBy={blockedBy}>
        <SegmentedControl
          value={value === "auto" ? null : value}
          aria-label={horizontal ? "Horizontal alignment" : "Vertical alignment"}
          data-test={`layout-grid-child-select-${property}`}
          className="layout__grid-child-alignment-control"
          disabled={blockedBy !== null}
          options={options.map((option) => ({
            ...option,
            testId: `layout-grid-child-align-${axis}-${option.value}`,
          }))}
          onChange={onChange}
          allowDeselect
          onDeselect={() => onChange("auto")}
        />
      </InlineStyleBlockedTooltip>
    </FieldRow>
  );
}

export function GridChildSection({
  domElement: el,
  editTarget,
  revision = 0,
  onAfterEdit,
  bare = false,
}: GridChildSectionProps): ReactElement {
  const target = editTarget ?? el;
  const elements = targetElements(target);
  const [column, setColumn] = useState<AxisState>(() => readAxis(el, "column"));
  const [row, setRow] = useState<AxisState>(() => readAxis(el, "row"));
  const [alignH, setAlignH] = useState(() => readGridChildAlignment(el, "h"));
  const [alignV, setAlignV] = useState(() => readGridChildAlignment(el, "v"));

  useEffect(() => {
    setColumn(readAxis(el, "column"));
    setRow(readAxis(el, "row"));
    setAlignH(readGridChildAlignment(el, "h"));
    setAlignV(readGridChildAlignment(el, "v"));
  }, [el, revision]);

  function handleAfterEdit(): void {
    onAfterEdit?.();
  }

  function handleStart(axis: GridAxis, start: string): void {
    if (commitGridAxisPlacement(target, axis, { start, span: "keep" }).length > 0) handleAfterEdit();
  }

  function handleAlignment(axis: "h" | "v", value: string): void {
    if (commitGridChildAlignment(target, axis, value).length > 0) handleAfterEdit();
  }

  return (
    <div className={bare ? "layout__grid-child" : "layout__group layout__grid-child"} data-test="layout-grid-child">
      {bare ? null : <div className="editor__title">Grid Child</div>}
      <div className="layout__grid-child-fields" data-test="layout-grid-child-fields">
        <AxisPlacementRow axis="column" label="Column" state={column} elements={elements} onStart={(start) => handleStart("column", start)} />
        <AxisPlacementRow axis="row" label="Row" state={row} elements={elements} onStart={(start) => handleStart("row", start)} />
        <AlignmentControl axis="v" value={alignV} elements={elements} onChange={(value) => handleAlignment("v", value)} />
        <AlignmentControl axis="h" value={alignH} elements={elements} onChange={(value) => handleAlignment("h", value)} />
      </div>
    </div>
  );
}
