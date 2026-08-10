import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { IconAdjustmentsHorizontal, IconArrowsMaximize, IconArrowsMinimize, IconCheck, IconLetterH, IconLetterW, IconSettings, IconSpacingHorizontal, IconSpacingVertical, IconTextWrap } from "@tabler/icons-react";
import type { TokenEntry } from "virtual:design-tokens";
import { tokens } from "virtual:design-tokens";
import type { SelectedElement } from "../selectionStore.ts";
import type { ResolvedProperty } from "@design-tool/css/model";
import { TokenField } from "../tokens/TokenField.tsx";
import { LayoutDropdown } from "./LayoutDropdown.tsx";
import { LayoutComboField } from "./LayoutComboField.tsx";
import { AspectRatioField } from "./AspectRatioField.tsx";
import { PositionAnchorControls } from "./PositionAnchorControls.tsx";
import { GridSection } from "./GridSection.tsx";
import { meaningfulLayoutValue } from "./layoutValue.ts";
import { setStyle } from "./styleActions.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { InspectorPopover } from "../ui/InspectorPopover.tsx";
import { PopoverListbox } from "../ui/PopoverListbox.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { Select } from "../ui/Select.tsx";
import { getStateStyleValue } from "../stateValue.ts";
import { formatInspectorLabel } from "../ui/labels.ts";
import { getElementComputedStyle } from "../domRealm.ts";
import { FieldRow } from "../ui/FieldRow.tsx";

const DISPLAY_OPTIONS = ["block", "inline", "inline-block", "flex", "inline-flex", "grid", "inline-grid", "none", "contents"];
const POSITION_OPTIONS = ["static", "relative", "absolute", "fixed", "sticky"];
const FLEX_DIRECTION_OPTIONS = ["row", "row-reverse", "column", "column-reverse"];
const ALIGN_CONTENT_OPTIONS = ["normal", "stretch", "flex-start", "flex-end", "center", "space-between", "space-around"];
const ALIGN_SELF_OPTIONS = ["auto", "stretch", "flex-start", "flex-end", "center", "baseline"];

const FLEX_GROW_PRESETS = ["0", "1", "2", "3"];
const FLEX_SHRINK_PRESETS = ["0", "1"];
const FLEX_BASIS_PRESETS = ["auto", "0", "0%", "100%", "50%", "fit-content"];
const ORDER_PRESETS = ["-1", "0", "1", "2", "3"];
const GAP_PRESETS = ["0", "0.25rem", "0.5rem", "0.75rem", "1rem", "1.5rem", "2rem", "3rem"];
const FLEX_ALIGNMENT_OPTIONS = ["flex-start", "center", "flex-end"];
const FLEX_DISTRIBUTION_OPTIONS = ["space-between", "space-around", "space-evenly"];
const SIZE_PRESETS = ["auto", "0", "100%", "fit-content"];
const MIN_SIZE_PRESETS = ["0", "min-content", "fit-content"];
const MAX_WIDTH_PRESETS = ["none", "100%", "100vw", "fit-content"];
const MAX_HEIGHT_PRESETS = ["none", "100%", "100vh", "fit-content"];

export interface LayoutSectionProps {
  element: SelectedElement;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  onAfterEdit?: () => void;
}

export function LayoutSection(props: LayoutSectionProps): ReactElement {
  const { element, entries, tokenRows = [], onAfterEdit } = props;
  const el = element.domElement;
  const allEntries = entries ?? tokens;

  const [isFlexContainer, setIsFlexContainer] = useState(false);
  const [isFlexChild, setIsFlexChild] = useState(false);
  const [isGridContainer, setIsGridContainer] = useState(false);
  const [isGridChild, setIsGridChild] = useState(false);
  const [position, setPosition] = useState(() => getStateStyleValue(el, "position", "static"));
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [flexDirection] = useComputedLayoutValue(el, "flex-direction", "row", layoutRevision);
  const [flexWrap] = useComputedLayoutValue(el, "flex-wrap", "nowrap", layoutRevision);
  const isFlexWrapped = flexWrap !== "nowrap";
  const relevantGap = flexDirection.startsWith("column") ? "row-gap" : "column-gap";
  const lineGap = relevantGap === "row-gap" ? "column-gap" : "row-gap";

  function notifyAfterEdit(): void {
    setLayoutRevision((revision) => revision + 1);
    onAfterEdit?.();
  }

  useEffect(() => {
    try {
      const cs = getElementComputedStyle(el);
      const display = cs.display;
      setIsFlexContainer(display === "flex" || display === "inline-flex");
      setIsGridContainer(display === "grid" || display === "inline-grid");
      setPosition(cs.position);
    } catch {
      // noop
    }
  }, [el, layoutRevision]);

  useEffect(() => {
    try {
      const parentEl = el.parentElement;
      if (!parentEl) {
        setIsFlexChild(false);
        setIsGridChild(false);
        return;
      }
      const pDisplay = getElementComputedStyle(parentEl).display;
      setIsFlexChild(pDisplay === "flex" || pDisplay === "inline-flex");
      setIsGridChild(pDisplay === "grid" || pDisplay === "inline-grid");
    } catch {
      setIsFlexChild(false);
      setIsGridChild(false);
    }
  }, [el, layoutRevision]);

  return (
    <div className="dt-editor" data-test="layout-section">
      <div className="dt-editor__title">Layout</div>
      <div className="dt-layout">
        <div className="dt-layout__basic">
          <SizeSection
            domElement={el}
            entries={allEntries}
            tokenRows={tokenRows}
            revision={layoutRevision}
            onAfterEdit={notifyAfterEdit}
          />

          <div className="dt-layout__tool-row">
            <LayoutDropdown
              property="display"
              options={DISPLAY_OPTIONS}
              domElement={el}
              revision={layoutRevision}
              onAfterEdit={notifyAfterEdit}
            />

            <LayoutDropdown
              property="position"
              options={POSITION_OPTIONS}
              domElement={el}
              revision={layoutRevision}
              onAfterEdit={notifyAfterEdit}
            />
          </div>
        </div>

        {isFlexContainer ? (
          <div className="dt-layout__group" data-test="layout-flex-container">
            <div className="dt-layout__group-title">Flex</div>
            <div className="dt-layout__flex-toolbar">
              <div className="dt-layout__direction-tools">
                <FlexDirectionControl domElement={el} revision={layoutRevision} onAfterEdit={notifyAfterEdit} />
                <FlexWrapToggle domElement={el} revision={layoutRevision} onAfterEdit={notifyAfterEdit} />
                <FlexSettingsMenu domElement={el} revision={layoutRevision} onAfterEdit={notifyAfterEdit} />
              </div>
            </div>
            <div className="dt-layout__flex-lower">
              <FlexAlignmentGrid domElement={el} revision={layoutRevision} onAfterEdit={notifyAfterEdit} />
              <div className="dt-layout__gap-column" data-test="layout-gap">
                <div className="dt-layout__gap-fields">
                  <div className="dt-layout__spacing-primary">
                    <FlexGapField
                      property={relevantGap}
                      domElement={el}
                      revision={layoutRevision}
                      onAfterEdit={notifyAfterEdit}
                    />
                    <FlexDistributionControl domElement={el} revision={layoutRevision} onAfterEdit={notifyAfterEdit} />
                  </div>
                  {isFlexWrapped ? (
                    <FlexGapField
                      property={lineGap}
                      domElement={el}
                      revision={layoutRevision}
                      onAfterEdit={notifyAfterEdit}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {isFlexChild ? (
          <div className="dt-layout__group" data-test="layout-flex-child">
            <div className="dt-layout__group-title">Flex Child</div>
            <div className="dt-layout__flex-child-fields">
              <FlexChildValueField
                label="Grow"
                property="flex-grow"
                presets={FLEX_GROW_PRESETS}
                domElement={el}
                inputOnly
                revision={layoutRevision}
                onAfterEdit={notifyAfterEdit}
              />
              <FlexChildValueField
                label="Shrink"
                property="flex-shrink"
                presets={FLEX_SHRINK_PRESETS}
                domElement={el}
                inputOnly
                revision={layoutRevision}
                onAfterEdit={notifyAfterEdit}
              />
              <FlexChildValueField
                label="Basis"
                property="flex-basis"
                presets={FLEX_BASIS_PRESETS}
                domElement={el}
                inputOnly
                revision={layoutRevision}
                onAfterEdit={notifyAfterEdit}
              />
              <FlexChildSettingsMenu
                domElement={el}
                revision={layoutRevision}
                onAfterEdit={notifyAfterEdit}
              />
            </div>
          </div>
        ) : null}

        {isGridContainer || isGridChild ? (
          <GridSection
            domElement={el}
            showContainer={isGridContainer}
            showChild={isGridChild}
            revision={layoutRevision}
            onAfterEdit={notifyAfterEdit}
          />
        ) : null}

        {position === "absolute" || position === "fixed" ? (
          <PositionAnchorControls
            domElement={el}
            entries={allEntries}
            tokenRows={tokenRows}
            revision={layoutRevision}
            onAfterEdit={notifyAfterEdit}
          />
        ) : null}
      </div>
    </div>
  );
}

interface SizeSectionProps {
  domElement: HTMLElement;
  entries: TokenEntry[];
  tokenRows: ResolvedProperty[];
  revision: number;
  onAfterEdit?: () => void;
}

function SizeSection({ domElement: el, entries, tokenRows, revision, onAfterEdit }: SizeSectionProps): ReactElement {
  const [expanded, setExpanded] = useState(false);

  const fields = [
    { property: "width", presets: SIZE_PRESETS },
    { property: "height", presets: SIZE_PRESETS },
    { property: "min-width", presets: MIN_SIZE_PRESETS },
    { property: "min-height", presets: MIN_SIZE_PRESETS },
    { property: "max-width", presets: MAX_WIDTH_PRESETS },
    { property: "max-height", presets: MAX_HEIGHT_PRESETS },
  ];

  function renderTokenField(property: string, presets: string[]): ReactElement {
    return (
      <TokenField
        property={property}
        tokenRow={tokenRows.find((row) => row.property === property) ?? null}
        initialValue={meaningfulLayoutValue(el, property)}
        domElement={el}
        entries={entries}
        suggestions={presets}
        className={property === "width" || property === "height" ? "dt-layout__size-field--icon" : undefined}
        leading={property === "width"
          ? <IconLetterW size="var(--dt-icon-size-small)" stroke={1.8} aria-hidden="true" />
          : property === "height"
            ? <IconLetterH size="var(--dt-icon-size-small)" stroke={1.8} aria-hidden="true" />
            : undefined}
        onAfterEdit={onAfterEdit}
      />
    );
  }

  return (
    <div className="dt-layout__size" data-test="layout-size" data-expanded={expanded ? "true" : "false"}>
      <div className="dt-layout__size-grid">
        <FieldRow label="Width" hideLabel data-test="layout-size-width" className="dt-layout__size-cell dt-layout__size-cell--width">
          {renderTokenField("width", SIZE_PRESETS)}
        </FieldRow>
        <FieldRow label="Height" hideLabel data-test="layout-size-height" className="dt-layout__size-cell dt-layout__size-cell--height">
          {renderTokenField("height", SIZE_PRESETS)}
        </FieldRow>
        <IconButton
          className="dt-layout__size-cell dt-layout__size-cell--toggle"
          variant="quiet"
          size="default"
          data-test={expanded ? "layout-size-collapse" : "layout-size-expand"}
          aria-label={expanded ? "Collapse Size Fields" : "Expand Size Fields"}
          label={expanded ? "Collapse Size Fields" : "Expand Size Fields"}
          title={expanded ? "Collapse Size Fields" : "Expand Size Fields"}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <IconArrowsMinimize size={16} stroke={1.8} aria-hidden="true" />
          ) : (
            <IconArrowsMaximize size={16} stroke={1.8} aria-hidden="true" />
          )}
        </IconButton>
        {expanded && fields.slice(2).map(({ property, presets }) => (
          <FieldRow
            key={property}
            label={property}
            data-test={`layout-size-${property}`}
            className={`dt-layout__size-cell dt-layout__size-cell--${property}`}
          >
            {renderTokenField(property, presets)}
          </FieldRow>
        ))}
        {expanded && (
          <AspectRatioField
            className="dt-layout__size-cell dt-layout__size-cell--aspect-ratio"
            domElement={el}
            entries={entries}
            tokenRow={tokenRows.find((row) => row.property === "aspect-ratio") ?? null}
            revision={revision}
            onAfterEdit={onAfterEdit}
          />
        )}
      </div>
    </div>
  );
}

interface FlexControlProps {
  domElement: HTMLElement;
  revision?: number;
  onAfterEdit?: () => void;
}

interface FlexChildValueFieldProps extends FlexControlProps {
  label: string;
  property: string;
  presets: string[];
  inputOnly?: boolean;
}

function FlexChildValueField({ label, property, presets, inputOnly = false, domElement, revision = 0, onAfterEdit }: FlexChildValueFieldProps): ReactElement {
  return (
    <FieldRow label={label} className="dt-layout__flex-child-field">
      <LayoutComboField
        property={property}
        presets={presets}
        domElement={domElement}
        inputOnly={inputOnly}
        revision={revision}
        onAfterEdit={onAfterEdit}
      />
    </FieldRow>
  );
}

function FlexChildSettingsMenu({ domElement, revision = 0, onAfterEdit }: FlexControlProps): ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <InspectorPopover
      data-test="layout-flex-child-settings"
      side="left"
      align="start"
      triggerElement={(
        <IconButton
          variant="quiet"
          size="default"
          label="Flex child settings"
          title="Flex child settings"
          data-test="layout-flex-child-settings"
        >
          <IconSettings size={16} stroke={1.8} aria-hidden="true" />
        </IconButton>
      )}
      open={open}
      onOpenChange={setOpen}
    >
      <div className="dt-layout__flex-child-settings" data-test="layout-flex-child-settings-content">
        <div className="dt-layout__flex-child-settings-title">Flex Child Settings</div>
        <LayoutDropdown
          property="align-self"
          options={ALIGN_SELF_OPTIONS}
          domElement={domElement}
          stacked
          revision={revision}
          onAfterEdit={onAfterEdit}
        />
        <FlexChildValueField
          label="Order"
          property="order"
          presets={ORDER_PRESETS}
          domElement={domElement}
          revision={revision}
          onAfterEdit={onAfterEdit}
        />
      </div>
    </InspectorPopover>
  );
}

interface FlexGapFieldProps extends FlexControlProps {
  property: "row-gap" | "column-gap";
}

function FlexGapField({ property, domElement, revision = 0, onAfterEdit }: FlexGapFieldProps): ReactElement {
  const field = (
    <LayoutComboField
      property={property}
      presets={GAP_PRESETS}
      domElement={domElement}
      inputOnly
      revision={revision}
      onAfterEdit={onAfterEdit}
    />
  );

  return (
    <div className="dt-layout__spacing-field">
      {property === "column-gap" ? (
        <IconSpacingHorizontal
          className="dt-layout__spacing-icon"
          size="var(--dt-icon-size-small)"
          stroke={1.8}
          aria-hidden="true"
          data-test={`layout-spacing-icon-${property}`}
        />
      ) : (
        <IconSpacingVertical
          className="dt-layout__spacing-icon"
          size="var(--dt-icon-size-small)"
          stroke={1.8}
          aria-hidden="true"
          data-test={`layout-spacing-icon-${property}`}
        />
      )}
      {field}
    </div>
  );
}

function FlexDirectionControl({ domElement, revision = 0, onAfterEdit }: FlexControlProps): ReactElement {
  const [direction, setDirection] = useComputedLayoutValue(domElement, "flex-direction", "row", revision);
  const orientation = direction.startsWith("column") ? "column" : "row";
  const reverse = direction.endsWith("-reverse");

  function selectDirection(next: string): void {
    if (!FLEX_DIRECTION_OPTIONS.includes(next)) return;
    setDirection(next);
    setStyle(domElement, "flex-direction", next);
    onAfterEdit?.();
  }

  return (
    <SegmentedControl
      value={orientation}
      aria-label="Flex direction"
      options={[
        {
          value: "row",
          label: "Set Flex Direction To Row",
          testId: "layout-direction-row",
          icon: (
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
            </svg>
          ),
        },
        {
          value: "column",
          label: "Set Flex Direction To Column",
          testId: "layout-direction-column",
          icon: (
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M8 2v11M4 9l4 4 4-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
            </svg>
          ),
        },
      ]}
      onChange={(next) => selectDirection(`${next}${reverse ? "-reverse" : ""}`)}
    />
  );
}

function FlexWrapToggle({ domElement, revision = 0, onAfterEdit }: FlexControlProps): ReactElement {
  const [wrap] = useComputedLayoutValue(domElement, "flex-wrap", "nowrap", revision);
  const isWrapped = wrap !== "nowrap";

  function toggleWrap(): void {
    setStyle(domElement, "flex-wrap", isWrapped ? "nowrap" : "wrap");
    onAfterEdit?.();
  }

  return (
    <IconButton
      variant="quiet"
      size="default"
      data-active={isWrapped}
      data-test="layout-flex-wrap-toggle"
      label={isWrapped ? "Disable Flex Wrap" : "Enable Flex Wrap"}
      aria-pressed={isWrapped}
      onClick={toggleWrap}
    >
      <IconTextWrap size={16} stroke={1.8} aria-hidden="true" />
    </IconButton>
  );
}

function FlexSettingsMenu({ domElement, revision = 0, onAfterEdit }: FlexControlProps): ReactElement {
  const [direction] = useComputedLayoutValue(domElement, "flex-direction", "row", revision);
  const [wrap] = useComputedLayoutValue(domElement, "flex-wrap", "nowrap", revision);
  const [alignContent] = useComputedLayoutValue(domElement, "align-content", "normal", revision);
  const [alignItems] = useComputedLayoutValue(domElement, "align-items", "stretch", revision);
  const [open, setOpen] = useState(false);
  const orientation = direction.startsWith("column") ? "column" : "row";
  const crossAxis = orientation === "column" ? "width" : "height";
  const isStretching = normalizeFlexAlign(alignItems) === "stretch";
  const reverseDirection = direction.endsWith("-reverse")
    ? orientation
    : `${orientation}-reverse`;

  const items = [
    {
      value: `flex-direction:${reverseDirection}`,
      label: formatInspectorLabel(reverseDirection),
      trailing: "Flex Direction",
      current: direction === reverseDirection,
      "data-test": "layout-flex-setting-direction-reverse",
    },
    {
      value: "flex-wrap:wrap-reverse",
      label: formatInspectorLabel("wrap-reverse"),
      trailing: "Flex Wrap",
      current: wrap === "wrap-reverse",
      "data-test": "layout-flex-setting-wrap-reverse",
    },
    ...ALIGN_CONTENT_OPTIONS.map((value) => ({
      value: `align-content:${value}`,
      label: formatInspectorLabel(value),
      trailing: "Align Content",
      current: alignContent === value,
      "data-test": `layout-flex-setting-align-content-${value}`,
    })),
    {
      value: "align-items:baseline",
      label: "Text baseline",
      trailing: "Cross-axis fit",
      current: alignItems === "baseline",
      "data-test": "layout-flex-setting-align-items-baseline",
    },
    {
      value: "align-items:stretch",
      label: `Children fill ${crossAxis}`,
      trailing: "Cross-axis fit",
      current: isStretching,
      "data-test": "layout-flex-setting-align-items-stretch",
    },
  ];

  function selectSetting(setting: string): void {
    const separator = setting.indexOf(":");
    if (separator < 0) return;
    const property = setting.slice(0, separator);
    const value = setting.slice(separator + 1);
    setStyle(domElement, property, value);
    setOpen(false);
    onAfterEdit?.();
  }

  return (
    <PopoverListbox
      query=""
      value={null}
      open={open}
      triggerElement={(
        <IconButton
          variant="quiet"
          size="default"
          label="Flex settings"
          data-test="layout-flex-settings"
        >
          <IconSettings size={16} stroke={1.8} aria-hidden="true" />
        </IconButton>
      )}
      triggerDataTest="layout-flex-settings"
      triggerAriaLabel="Flex settings"
      items={items.map((item) => ({
        value: item.value,
        label: item.label,
        trailing: item.trailing,
        leading: item.current ? <IconCheck size={14} stroke={2} aria-hidden="true" /> : undefined,
        "data-test": item["data-test"],
      }))}
      onQueryChange={() => undefined}
      onOpenChange={setOpen}
      onSelect={selectSetting}
    />
  );
}

function FlexDistributionControl({ domElement, revision = 0, onAfterEdit }: FlexControlProps): ReactElement {
  const [computedJustify] = useComputedLayoutValue(domElement, "justify-content", "flex-start", revision);
  const justify = normalizeFlexJustify(computedJustify);
  const lastPlacement = useRef("flex-start");
  const distributed = FLEX_DISTRIBUTION_OPTIONS.includes(justify);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (FLEX_ALIGNMENT_OPTIONS.includes(justify)) lastPlacement.current = justify;
  }, [justify]);

  function selectDistribution(next: string): void {
    const value = next === "packed" ? lastPlacement.current : next;
    setStyle(domElement, "justify-content", value);
    onAfterEdit?.();
  }

  return (
    <PopoverListbox
      className="dt-layout__distribution-control"
      query=""
      value={distributed ? justify : "packed"}
      open={open}
      triggerElement={(
        <IconButton
          variant="secondary"
          size="default"
          label="Item distribution"
          title="Item distribution"
          data-active={distributed}
          data-test="layout-flex-distribution"
        >
          <IconAdjustmentsHorizontal size={16} stroke={1.8} aria-hidden="true" />
        </IconButton>
      )}
      triggerDataTest="layout-flex-distribution"
      triggerAriaLabel="Item distribution"
      items={[
        { value: "packed", label: "Keep grouped" },
        { value: "space-between", label: "Spread between" },
        { value: "space-around", label: "Spread around" },
        { value: "space-evenly", label: "Spread evenly" },
      ].map((item) => ({
        ...item,
        leading: (distributed ? justify : "packed") === item.value
          ? <IconCheck size={14} stroke={2} aria-hidden="true" />
          : undefined,
        "data-test": `layout-flex-distribution-${item.value}`,
      }))}
      onQueryChange={() => undefined}
      onOpenChange={setOpen}
      onSelect={(next) => {
        selectDistribution(next);
        setOpen(false);
      }}
    />
  );
}

function FlexAlignmentGrid({ domElement, revision = 0, onAfterEdit }: FlexControlProps): ReactElement {
  const [direction] = useComputedLayoutValue(domElement, "flex-direction", "row", revision);
  const [computedJustify, setJustify] = useComputedLayoutValue(domElement, "justify-content", "flex-start", revision);
  const [computedAlign, setAlign] = useComputedLayoutValue(domElement, "align-items", "stretch", revision);
  const justify = normalizeFlexJustify(computedJustify);
  const align = normalizeFlexAlign(computedAlign);
  const isColumn = direction.startsWith("column");
  const isReverse = direction.endsWith("-reverse");
  const distributed = FLEX_DISTRIBUTION_OPTIONS.includes(justify);

  // The grid represents physical positions in the parent. For row flex
  // containers, justify-content runs horizontally; for column flex
  // containers, it runs vertically, so the two grid axes need to transpose.
  const rowValues = isColumn
    ? isReverse ? [...FLEX_ALIGNMENT_OPTIONS].reverse() : FLEX_ALIGNMENT_OPTIONS
    : FLEX_ALIGNMENT_OPTIONS;
  const columnValues = !isColumn && isReverse
    ? [...FLEX_ALIGNMENT_OPTIONS].reverse()
    : FLEX_ALIGNMENT_OPTIONS;

  function selectAlignment(nextJustify: string, nextAlign: string): void {
    setJustify(nextJustify);
    setAlign(nextAlign);
    setStyle(domElement, "justify-content", nextJustify);
    setStyle(domElement, "align-items", nextAlign);
    onAfterEdit?.();
  }

  return (
    <div
      className="dt-layout__alignment-grid"
      role="group"
      aria-label="Place flex items"
      data-direction={isColumn ? "column" : "row"}
      data-justify={justify}
      data-align={align}
      data-distributed={distributed}
    >
      {distributed ? (
        <span className="dt-layout__distribution-preview" aria-hidden="true">
          <span /><span /><span />
        </span>
      ) : null}
      {rowValues.flatMap((rowValue) =>
        columnValues.map((columnValue) => {
          const justifyValue = isColumn ? rowValue : columnValue;
          const alignValue = isColumn ? columnValue : rowValue;
          const active = justify === justifyValue && align === alignValue;
          return (
            <IconButton
              key={`${alignValue}-${justifyValue}`}
              size="default"
              variant="quiet"
              className="dt-layout__alignment-button"
              data-active={active}
              data-test={`layout-align-${alignValue}-${justifyValue}`}
              label={formatInspectorLabel(`Align ${alignValue.replace("flex-", "")} And Distribute ${justifyValue.replace("flex-", "")}`)}
              aria-pressed={active}
              onClick={() => selectAlignment(justifyValue, alignValue)}
            >
              <span />
            </IconButton>
          );
        }),
      )}
    </div>
  );
}

function normalizeFlexJustify(value: string): string {
  // `normal` is the computed initial value, but behaves as `flex-start` for
  // flex containers. Show the physical placement the user will actually see.
  return value === "normal" ? "flex-start" : value;
}

function normalizeFlexAlign(value: string): string {
  // The initial `normal` value resolves to stretch for flex items.
  return value === "normal" ? "stretch" : value;
}

function useComputedLayoutValue(
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
