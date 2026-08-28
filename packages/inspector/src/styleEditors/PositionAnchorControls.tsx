import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { IconBorderSides } from "@tabler/icons-react";
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "@nudge-ui/css/model";
import { FieldRow } from "../ui/FieldRow.tsx";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import { Button } from "../ui/Button.tsx";
import { ToggleButton } from "../ui/ToggleButton.tsx";
import { MarginSideIndicator, SideControls, SIDE_NAMES, type SideValueSlot } from "../ui/SideValuesField.tsx";
import { TokenField } from "../tokens/TokenField.tsx";
import { setStyles } from "./styleActions.ts";
import { meaningfulLayoutValue } from "./layoutValue.ts";
import { anchorEditPlan, axisAnchor, axisSide, type Axis, type AxisAnchor, type AxisInsetValues } from "./positionAnchor.ts";
import { getNudgeUiTokenEntries } from "../runtimeConfig.ts";

const OFFSET_PRESETS = ["auto", "0", "50%", "100%"];
const ANCHOR_OPTIONS: ReadonlyArray<Exclude<AxisAnchor, "none">> = ["start", "end", "stretch"];
type PhysicalSide = "left" | "right" | "top" | "bottom";

export interface PositionAnchorControlsProps {
  domElement: HTMLElement;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  revision?: number;
  onAfterEdit?: () => void;
}

export function PositionAnchorControls({
  domElement: el,
  entries,
  tokenRows = [],
  revision = 0,
  onAfterEdit,
}: PositionAnchorControlsProps): ReactElement {
  const allEntries = entries ?? getNudgeUiTokenEntries();
  const [expanded, setExpanded] = useState(false);
  const values = useInsetValues(el, revision);
  const horizontalAnchor = axisAnchor(values.horizontal);
  const verticalAnchor = axisAnchor(values.vertical);
  const shownHorizontal = horizontalAnchor === "none" ? "start" : horizontalAnchor;
  const shownVertical = verticalAnchor === "none" ? "start" : verticalAnchor;

  useEffect(() => setExpanded(false), [el]);

  const insetSlots = useMemo(() => SIDE_NAMES.map((side): SideValueSlot => ({
    side,
    icon: <MarginSideIndicator side={side} />,
    control: (
      <TokenField
        property={side}
        tokenRow={tokenRows.find((row) => row.property === side) ?? null}
        initialValue={valuesForSide(values, side)}
        domElement={el}
        entries={allEntries}
        suggestions={OFFSET_PRESETS}
        onAfterEdit={onAfterEdit}
      />
    ),
  })), [allEntries, el, onAfterEdit, tokenRows, values]);

  function selectAnchor(axis: Axis, target: Exclude<AxisAnchor, "none">): void {
    const plan = anchorEditPlan(axis, target, values[axis]);
    setStyles(el, plan);
    onAfterEdit?.();
  }

  return (
    <div
      className="layout__group"
      data-test="layout-position"
      data-anchor-horizontal={horizontalAnchor}
      data-anchor-vertical={verticalAnchor}
    >
      <div className="editor__title">Position</div>
      <AxisAnchorRow
        axis="horizontal"
        current={shownHorizontal}
        onSelect={(target) => selectAnchor("horizontal", target)}
      />
      <AxisAnchorRow
        axis="vertical"
        current={shownVertical}
        onSelect={(target) => selectAnchor("vertical", target)}
      />
      <div className="layout__position-fields">
        {shownHorizontal === "stretch" ? (
          <>
          <FieldRow label="left" data-test="layout-position-x-left">
              <ControlSurface>
                <TokenField
                  property="left"
                  tokenRow={tokenRows.find((row) => row.property === "left") ?? null}
                  initialValue={values.horizontal.start}
                  domElement={el}
                  entries={allEntries}
                  suggestions={OFFSET_PRESETS}
                  onAfterEdit={onAfterEdit}
                />
              </ControlSurface>
            </FieldRow>
            <FieldRow label="right" data-test="layout-position-x-right">
              <ControlSurface>
                <TokenField
                  property="right"
                  tokenRow={tokenRows.find((row) => row.property === "right") ?? null}
                  initialValue={values.horizontal.end}
                  domElement={el}
                  entries={allEntries}
                  suggestions={OFFSET_PRESETS}
                  onAfterEdit={onAfterEdit}
                />
              </ControlSurface>
            </FieldRow>
          </>
        ) : (
          <FieldRow label="X" data-test="layout-position-x">
            <PositionValueField
              property={axisSide("horizontal", shownHorizontal)}
              tokenRows={tokenRows}
              values={values}
              axis="horizontal"
              domElement={el}
              entries={allEntries}
              onAfterEdit={onAfterEdit}
            />
          </FieldRow>
        )}
        {shownVertical === "stretch" ? (
          <>
            <FieldRow label="top" data-test="layout-position-y-top">
              <ControlSurface>
                <TokenField
                  property="top"
                  tokenRow={tokenRows.find((row) => row.property === "top") ?? null}
                  initialValue={values.vertical.start}
                  domElement={el}
                  entries={allEntries}
                  suggestions={OFFSET_PRESETS}
                  onAfterEdit={onAfterEdit}
                />
              </ControlSurface>
            </FieldRow>
            <FieldRow label="bottom" data-test="layout-position-y-bottom">
              <ControlSurface>
                <TokenField
                  property="bottom"
                  tokenRow={tokenRows.find((row) => row.property === "bottom") ?? null}
                  initialValue={values.vertical.end}
                  domElement={el}
                  entries={allEntries}
                  suggestions={OFFSET_PRESETS}
                  onAfterEdit={onAfterEdit}
                />
              </ControlSurface>
            </FieldRow>
          </>
        ) : (
          <FieldRow label="Y" data-test="layout-position-y">
            <PositionValueField
              property={axisSide("vertical", shownVertical)}
              tokenRows={tokenRows}
              values={values}
              axis="vertical"
              domElement={el}
              entries={allEntries}
              onAfterEdit={onAfterEdit}
            />
          </FieldRow>
        )}
      </div>
      <div className="layout__individual-insets">
        <ToggleButton
          variant="quiet"
          size="default"
          data-test="layout-position-individual-toggle"
          label={expanded ? "Hide Individual Insets" : "Show Individual Insets"}
          pressed={expanded}
          onPressedChange={(pressed) => setExpanded(pressed)}
        >
          <IconBorderSides size={15} aria-hidden="true" />
        </ToggleButton>
        <span>Individual insets</span>
      </div>
      {expanded ? <SideControls label="Inset" sides={insetSlots} /> : null}
    </div>
  );
}

interface AxisAnchorRowProps {
  axis: Axis;
  current: Exclude<AxisAnchor, "none">;
  onSelect: (target: Exclude<AxisAnchor, "none">) => void;
}

function AxisAnchorRow({ axis, current, onSelect }: AxisAnchorRowProps): ReactElement {
  const label = axis === "horizontal" ? "Horizontal anchor" : "Vertical anchor";
  const labels = axis === "horizontal"
    ? { start: "Left", end: "Right", stretch: "Stretch" }
    : { start: "Top", end: "Bottom", stretch: "Stretch" };
  return (
    <div className="layout__anchor-row">
      <span className="layout__anchor-label">{label}</span>
      <div className="layout__anchor-control" role="group" aria-label={label}>
        {ANCHOR_OPTIONS.map((option) => (
          <Button
            key={option}
            size="compact"
            variant="quiet"
            data-test={`layout-anchor-${axis}-${option}`}
            data-active={current === option}
            aria-pressed={current === option}
            aria-label={`Anchor ${axis} to ${labels[option]}`}
            onClick={() => onSelect(option)}
          >
            {labels[option]}
          </Button>
        ))}
      </div>
    </div>
  );
}

function readInsetValue(el: HTMLElement, property: PhysicalSide): string {
  return meaningfulLayoutValue(el, property);
}

function useInsetValues(
  el: HTMLElement,
  revision: number,
): { horizontal: AxisInsetValues; vertical: AxisInsetValues } {
  const [values, setValues] = useState(() => ({
    horizontal: { start: readInsetValue(el, "left"), end: readInsetValue(el, "right") },
    vertical: { start: readInsetValue(el, "top"), end: readInsetValue(el, "bottom") },
  }));
  useEffect(() => {
    setValues({
      horizontal: { start: readInsetValue(el, "left"), end: readInsetValue(el, "right") },
      vertical: { start: readInsetValue(el, "top"), end: readInsetValue(el, "bottom") },
    });
  }, [el, revision]);
  return values;
}

interface PositionValueFieldProps {
  property: PhysicalSide;
  tokenRows: ResolvedProperty[];
  values: { horizontal: AxisInsetValues; vertical: AxisInsetValues };
  axis: Axis;
  domElement: HTMLElement;
  entries: TokenEntry[];
  onAfterEdit?: () => void;
}

function PositionValueField({
  property,
  tokenRows,
  values,
  axis,
  domElement: el,
  entries,
  onAfterEdit,
}: PositionValueFieldProps): ReactElement {
  return (
    <ControlSurface>
      <TokenField
        property={property}
        tokenRow={tokenRows.find((row) => row.property === property) ?? null}
        initialValue={axis === "horizontal"
          ? property === "left" ? values.horizontal.start : values.horizontal.end
          : property === "top" ? values.vertical.start : values.vertical.end}
        domElement={el}
        entries={entries}
        suggestions={OFFSET_PRESETS}
        onAfterEdit={onAfterEdit}
      />
    </ControlSurface>
  );
}

function valuesForSide(
  values: { horizontal: AxisInsetValues; vertical: AxisInsetValues },
  side: PhysicalSide,
): string {
  if (side === "left") return values.horizontal.start;
  if (side === "right") return values.horizontal.end;
  if (side === "top") return values.vertical.start;
  return values.vertical.end;
}
