import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { IconArrowBack, IconCheck, IconChevronDown, IconSpacingHorizontal, IconSpacingVertical } from "@tabler/icons-react";
import type { ResolvedProperty, TokenEntry } from "../../css/model/index.ts";
import { LayoutComboField } from "./LayoutComboField.tsx";
import { GapField } from "./GapField.tsx";
import { inlineBlockedBy } from "./inlineAuthored.ts";
import { setStyle, setStyles } from "../tokens/editActions.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { PopoverListbox } from "../ui/PopoverListbox.tsx";
import { getStateStyleValue } from "../shell/stateValue.ts";
import { FieldRow } from "../ui/FieldRow.tsx";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { inlineStyleWarningContent } from "../ui/InlineStyleWarning.tsx";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";

export const ALIGN_SELF_OPTIONS = ["auto", "stretch", "flex-start", "flex-end", "center", "baseline"];
export const ORDER_PRESETS = ["-1", "0", "1", "2", "3"];
const FLEX_ALIGNMENT_OPTIONS = ["flex-start", "center", "flex-end"];
const FLEX_DISTRIBUTION_OPTIONS = ["space-between", "space-around", "space-evenly"];
const ALIGNMENT_ROW_NAMES = ["top", "center", "bottom"];
const ALIGNMENT_COLUMN_NAMES = ["left", "center", "right"];
/** Bar lengths in px along the cross axis: shortest first, the longest in the middle, a medium one last. */
const ALIGNMENT_GLYPH_BARS = [8, 16, 12];

/** The tooltip for a cell of the physical 3x3 grid, e.g. "Align top left" or just "Align center". */
function alignmentLabel(row: number, column: number): string {
  return row === 1 && column === 1 ? "Align center" : `Align ${ALIGNMENT_ROW_NAMES[row]} ${ALIGNMENT_COLUMN_NAMES[column]}`;
}

export interface FlexControlProps {
  domElement: HTMLElement;
  editTarget?: EditTarget;
  selection?: StyleSelection | null;
  revision?: number;
  onAfterEdit?: () => void;
}

export interface LayoutValueFieldProps extends FlexControlProps {
  label: string;
  property: string;
  presets: string[];
  inputOnly?: boolean;
}

export function LayoutValueField({ label, property, presets, inputOnly = false, domElement, editTarget, selection, revision = 0, onAfterEdit }: LayoutValueFieldProps): ReactElement {
  return (
    <FieldRow label={label} className="field-row--stacked">
      <LayoutComboField
        property={property}
        presets={presets}
        domElement={domElement}
        editTarget={editTarget}
        selection={selection}
        inputOnly={inputOnly}
        revision={revision}
        onAfterEdit={onAfterEdit}
      />
    </FieldRow>
  );
}

export interface FlexGapFieldProps extends FlexControlProps {
  property: "row-gap" | "column-gap";
  entries: TokenEntry[];
  tokenRows: ResolvedProperty[];
}

export function FlexGapField({ property, domElement, editTarget, selection, entries, tokenRows, onAfterEdit }: FlexGapFieldProps): ReactElement {
  const GapIcon = property === "column-gap" ? IconSpacingHorizontal : IconSpacingVertical;
  return (
    <ControlSurface className="layout__spacing-field">
      <GapField
        property={property}
        domElement={domElement}
        editTarget={editTarget}
        selection={selection}
        entries={entries}
        tokenRows={tokenRows}
        leading={(
          <GapIcon
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
  );
}

export function FlexWrapToggle({ domElement, editTarget, selection, revision = 0, onAfterEdit }: FlexControlProps): ReactElement {
  const [wrap] = useComputedLayoutValue(domElement, "flex-wrap", "nowrap", revision);
  const selectedWrap = selection?.getProperty("flex-wrap")?.value;
  const mixed = selectedWrap?.kind === "mixed";
  const sharedWrap = selectedWrap?.kind === "common" ? selectedWrap.value : wrap;
  const isWrapped = !mixed && sharedWrap !== "nowrap";
  const blockedBy = inlineBlockedBy(selection?.domElements ?? [domElement], "flex-wrap");

  function toggleWrap(): void {
    if (blockedBy) return;
    setStyle(editTarget ?? domElement, "flex-wrap", isWrapped ? "nowrap" : "wrap");
    onAfterEdit?.();
  }

  return (
    <Tooltip content={inlineStyleWarningContent(blockedBy)}>
      <IconButton
        variant="quiet"
        size="default"
        data-active={isWrapped}
        data-test="layout-flex-wrap-toggle"
        label={mixed ? "Set Flex Wrap" : isWrapped ? "Disable Flex Wrap" : "Enable Flex Wrap"}
        aria-pressed={mixed ? "mixed" : isWrapped}
        disabled={blockedBy !== null}
        onClick={toggleWrap}
      >
        <IconArrowBack size={16} stroke={1.8} aria-hidden="true" />
      </IconButton>
    </Tooltip>
  );
}

const DISTRIBUTION_ITEMS = [
  { value: "packed", label: "Keep grouped" },
  { value: "space-between", label: "Spread between" },
  { value: "space-around", label: "Spread around" },
  { value: "space-evenly", label: "Spread evenly" },
];

/** The main-axis gap. Spreading the items (`justify-content: space-*`) replaces the fixed gap, so the field reads Auto, keeps the gap as a faint value, and typing `auto` spreads between. */
export function FlexMainGapField({ property, domElement, editTarget, selection, entries, tokenRows, revision = 0, onAfterEdit }: FlexGapFieldProps & { revision?: number }): ReactElement {
  const GapIcon = property === "column-gap" ? IconSpacingHorizontal : IconSpacingVertical;
  const [computedJustify] = useComputedLayoutValue(domElement, "justify-content", "flex-start", revision);
  const justify = normalizeFlexJustify(computedJustify);
  const distributed = FLEX_DISTRIBUTION_OPTIONS.includes(justify);
  const lastPlacement = useRef("flex-start");
  const [open, setOpen] = useState(false);
  const blockedBy = inlineBlockedBy(selection?.domElements ?? [domElement], "justify-content");
  const target = editTarget ?? domElement;
  const gapPixels = Number.parseFloat(getStateStyleValue(domElement, property));

  useEffect(() => {
    if (FLEX_ALIGNMENT_OPTIONS.includes(justify)) lastPlacement.current = justify;
  }, [justify]);

  function setJustifyContent(value: string): void {
    if (blockedBy) return;
    setStyle(target, "justify-content", value);
    onAfterEdit?.();
  }

  function interceptRaw(value: string): boolean {
    if (value.trim().toLowerCase() === "auto") {
      if (!distributed) setJustifyContent("space-between");
      return true;
    }
    // A typed gap takes the items back out of a spread; the gap value itself is written by the field, which still saves it when justify-content is authored inline and cannot be changed here.
    if (distributed) setJustifyContent(lastPlacement.current);
    return false;
  }

  const chevron = (
    <PopoverListbox
      query=""
      value={distributed ? justify : "packed"}
      open={open}
      triggerElement={(
        <IconButton
          variant="quiet"
          size="compact"
          label="Item distribution"
          data-test="layout-flex-distribution"
        >
          <IconChevronDown size={16} stroke={1.8} aria-hidden="true" />
        </IconButton>
      )}
      triggerDataTest="layout-flex-distribution"
      triggerAriaLabel="Item distribution"
      triggerTooltip={inlineStyleWarningContent(blockedBy)}
      disabled={blockedBy !== null}
      items={DISTRIBUTION_ITEMS.map((item) => ({
        ...item,
        leading: (distributed ? justify : "packed") === item.value
          ? <IconCheck size={14} stroke={2} aria-hidden="true" />
          : undefined,
        "data-test": `layout-flex-distribution-${item.value}`,
      }))}
      onQueryChange={() => undefined}
      onOpenChange={setOpen}
      onSelect={(next) => {
        setJustifyContent(next === "packed" ? lastPlacement.current : next);
        setOpen(false);
      }}
    />
  );

  return (
    <ControlSurface className="layout__spacing-field">
      <GapField
        property={property}
        domElement={domElement}
        editTarget={editTarget}
        selection={selection}
        entries={entries}
        tokenRows={tokenRows}
        {...(distributed ? { displayOverride: "Auto" } : {})}
        interceptRaw={interceptRaw}
        trailing={(
          <>
            {distributed && Number.isFinite(gapPixels) ? (
              <span className="layout__resolved" data-test="layout-gap-value">{Math.round(gapPixels)}</span>
            ) : null}
            {chevron}
          </>
        )}
        leading={(
          <GapIcon
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
  );
}

export function FlexAlignmentGrid({ domElement, editTarget, selection, revision = 0, onAfterEdit }: FlexControlProps): ReactElement {
  const [direction] = useComputedLayoutValue(domElement, "flex-direction", "row", revision);
  const [computedJustify, setJustify] = useComputedLayoutValue(domElement, "justify-content", "flex-start", revision);
  const [computedAlign, setAlign] = useComputedLayoutValue(domElement, "align-items", "stretch", revision);
  const justify = normalizeFlexJustify(computedJustify);
  const align = normalizeFlexAlign(computedAlign);
  const isColumn = direction.startsWith("column");
  const isReverse = direction.endsWith("-reverse");
  const distributed = FLEX_DISTRIBUTION_OPTIONS.includes(justify);
  const blockedBy = inlineBlockedBy(selection?.domElements ?? [domElement], "justify-content", "align-items");

  // The grid shows physical positions: justify-content runs along the main axis, so column containers transpose the axes.
  const rowValues = isColumn
    ? isReverse ? [...FLEX_ALIGNMENT_OPTIONS].reverse() : FLEX_ALIGNMENT_OPTIONS
    : FLEX_ALIGNMENT_OPTIONS;
  const columnValues = !isColumn && isReverse
    ? [...FLEX_ALIGNMENT_OPTIONS].reverse()
    : FLEX_ALIGNMENT_OPTIONS;

  function selectAlignment(nextJustify: string, nextAlign: string): void {
    if (blockedBy) return;
    // A grid click changing cross-axis alignment must not replace an explicit distribution choice.
    const resolvedJustify = distributed ? justify : nextJustify;
    setJustify(resolvedJustify);
    setAlign(nextAlign);
    setStyles(editTarget ?? domElement, [
      { property: "justify-content", value: resolvedJustify },
      { property: "align-items", value: nextAlign },
    ]);
    onAfterEdit?.();
  }

  // The glyph sits in the active cell, or runs the whole main axis when items are spread, at the cross-axis alignment.
  const crossValues = isColumn ? columnValues : rowValues;
  const crossIndex = crossValues.indexOf(align);
  const activeRow = rowValues.indexOf(isColumn ? justify : align);
  const activeColumn = columnValues.indexOf(isColumn ? align : justify);
  const glyphPlacement = distributed
    ? crossIndex < 0 ? null : isColumn ? { row: "1 / -1", column: crossIndex + 1 } : { row: crossIndex + 1, column: "1 / -1" }
    : activeRow < 0 || activeColumn < 0 ? null : { row: activeRow + 1, column: activeColumn + 1 };

  const grid = (
    <div
      className="layout__alignment-grid"
      role="group"
      aria-label="Place flex items"
      data-direction={isColumn ? "column" : "row"}
      data-justify={justify}
      data-align={align}
      data-distributed={distributed}
    >
      {rowValues.flatMap((rowValue, rowIndex) =>
        columnValues.map((columnValue, columnIndex) => {
          const justifyValue = isColumn ? rowValue : columnValue;
          const alignValue = isColumn ? columnValue : rowValue;
          const active = justify === justifyValue && align === alignValue;
          // The glyph replaces the dots it covers.
          const covered = glyphPlacement !== null && distributed && (isColumn ? columnIndex : rowIndex) === crossIndex;
          return (
            <Tooltip key={`${alignValue}-${justifyValue}`}>
              <IconButton
                size="default"
                variant="quiet"
                className="layout__alignment-button"
                data-active={active}
                data-covered={covered ? "true" : undefined}
                data-test={`layout-align-${alignValue}-${justifyValue}`}
                label={alignmentLabel(rowIndex, columnIndex)}
                aria-pressed={active}
                disabled={blockedBy !== null}
                onClick={() => selectAlignment(justifyValue, alignValue)}
              >
                <span />
              </IconButton>
            </Tooltip>
          );
        }),
      )}
      {glyphPlacement ? (
        <span className="layout__alignment-glyph-layer" aria-hidden="true">
          <span
            className="layout__alignment-glyph"
            data-test="layout-alignment-glyph"
            data-axis={isColumn ? "column" : "row"}
            data-distributed={distributed}
            style={{
              gridRow: glyphPlacement.row,
              gridColumn: glyphPlacement.column,
              flexDirection: direction as "row" | "row-reverse" | "column" | "column-reverse",
              alignItems: align,
              justifyContent: distributed ? justify : undefined,
            }}
          >
            {ALIGNMENT_GLYPH_BARS.map((length) => <span key={length} style={isColumn ? { width: length } : { height: length }} />)}
          </span>
        </span>
      ) : null}
    </div>
  );
  return <Tooltip content={inlineStyleWarningContent(blockedBy)} disabled={blockedBy === null}>{grid}</Tooltip>;
}

function normalizeFlexJustify(value: string): string {
  // Computed `normal` behaves as `flex-start` for flex containers, so show the physical placement.
  return value === "normal" ? "flex-start" : value;
}

function normalizeFlexAlign(value: string): string {
  // `normal` resolves to stretch for flex items.
  return value === "normal" ? "stretch" : value;
}

export function useComputedLayoutValue(
  domElement: HTMLElement,
  property: string,
  fallback: string,
  revision: number,
): [string, (value: string) => void] {
  const [value, setValue] = useState(() => readLayoutValue(domElement, property, fallback));

  useEffect(() => {
    setValue(readLayoutValue(domElement, property, fallback));
  }, [domElement, property, fallback, revision]);

  return [value, setValue];
}

function readLayoutValue(domElement: HTMLElement, property: string, fallback: string): string {
  return getStateStyleValue(domElement, property, fallback);
}
