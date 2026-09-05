import { useEffect, useRef, useState } from "react";
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
import {
  commitGridAxisPlacement,
  commitGridChildAlignment,
  readGridAxisPlacement,
  readGridChildAlignment,
  type GridAxis,
  type GridAxisPlacement,
} from "./gridChildModel.ts";

export interface GridChildSectionProps {
  domElement: HTMLElement;
  revision?: number;
  onAfterEdit?: () => void;
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
  onStart: (start: string) => void;
}

function AxisPlacementRow({ axis, label, state, onStart }: AxisPlacementRowProps): ReactElement {
  const [draft, setDraft] = useState(state.placement.start);
  const draftRef = useRef(draft);

  useEffect(() => {
    draftRef.current = state.placement.start;
    setDraft(state.placement.start);
  }, [state.placement.start]);

  function updateDraft(next: string): void {
    draftRef.current = next;
    setDraft(next);
  }

  function commit(): void {
    const next = draftRef.current.trim() || "auto";
    updateDraft(next);
    if (next !== state.placement.start) onStart(next);
  }

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
          value={draft}
          data-test={`layout-grid-child-${axis}-start`}
          aria-label={label}
          onChange={(event) => updateDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              updateDraft(state.placement.start);
              event.currentTarget.blur();
            } else if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
      </ControlSurface>
    </FieldRow>
  );
}

interface AlignmentControlProps {
  axis: "h" | "v";
  value: string;
  onChange: (value: string) => void;
}

function AlignmentControl({ axis, value, onChange }: AlignmentControlProps): ReactElement {
  const horizontal = axis === "h";
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
      <SegmentedControl
        value={value === "auto" ? null : value}
        aria-label={horizontal ? "Horizontal alignment" : "Vertical alignment"}
        data-test={`layout-grid-child-select-${horizontal ? "justify-self" : "align-self"}`}
        className="layout__grid-child-alignment-control"
        options={options.map((option) => ({
          ...option,
          testId: `layout-grid-child-align-${axis}-${option.value}`,
        }))}
        onChange={onChange}
        allowDeselect
        onDeselect={() => onChange("auto")}
      />
    </FieldRow>
  );
}

/**
 * Grid child controls expose only placement starts and per-axis alignment.
 * All edits commit as managed CSS declarations. Moving a start line preserves
 * an existing span where CSS makes that span unambiguous.
 */
export function GridChildSection({
  domElement: el,
  revision = 0,
  onAfterEdit,
}: GridChildSectionProps): ReactElement {
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
    if (commitGridAxisPlacement(el, axis, { start, span: "keep" }).length > 0) handleAfterEdit();
  }

  function handleAlignment(axis: "h" | "v", value: string): void {
    if (commitGridChildAlignment(el, axis, value).length > 0) handleAfterEdit();
  }

  return (
    <div className="layout__group layout__grid-child" data-test="layout-grid-child">
      <div className="editor__title">Grid Child</div>
      <div className="layout__grid-child-fields" data-test="layout-grid-child-fields">
        <AxisPlacementRow axis="column" label="Column" state={column} onStart={(start) => handleStart("column", start)} />
        <AxisPlacementRow axis="row" label="Row" state={row} onStart={(start) => handleStart("row", start)} />
        <AlignmentControl axis="v" value={alignV} onChange={(value) => handleAlignment("v", value)} />
        <AlignmentControl axis="h" value={alignH} onChange={(value) => handleAlignment("h", value)} />
      </div>
    </div>
  );
}
