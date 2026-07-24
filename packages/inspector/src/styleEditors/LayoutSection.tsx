import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Check, Settings2, WrapText } from "lucide-react";
import type { TokenEntry } from "virtual:design-tokens";
import { tokens } from "virtual:design-tokens";
import type { SelectedElement } from "../selectionStore.ts";
import type { ResolvedProperty } from "../tokens/resolution.ts";
import { TokenField } from "../tokens/TokenField.tsx";
import { SIDE_NAMES, SideControls, type SideValueSlot } from "../ui/SideValuesField.tsx";
import { LayoutDropdown } from "./LayoutDropdown.tsx";
import { LayoutComboField } from "./LayoutComboField.tsx";
import { AspectRatioField } from "./AspectRatioField.tsx";
import { PositionAnchorControls } from "./PositionAnchorControls.tsx";
import { meaningfulLayoutValue } from "./layoutValue.ts";
import { setStyle } from "./styleActions.ts";
import { Button } from "../ui/Button.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { PopoverListbox } from "../ui/PopoverListbox.tsx";
import { getStateStyleValue } from "../stateValue.ts";
import { formatInspectorLabel } from "../ui/labels.ts";
import { getElementComputedStyle } from "../domRealm.ts";
import { FieldRow } from "../ui/FieldRow.tsx";

const DISPLAY_OPTIONS = ["block", "inline", "inline-block", "flex", "inline-flex", "none", "contents"];
const POSITION_OPTIONS = ["static", "relative", "absolute", "fixed", "sticky"];
const FLEX_DIRECTION_OPTIONS = ["row", "row-reverse", "column", "column-reverse"];
const JUSTIFY_CONTENT_OPTIONS = ["flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly"];
const ALIGN_ITEMS_OPTIONS = ["stretch", "flex-start", "flex-end", "center", "baseline"];
const ALIGN_CONTENT_OPTIONS = ["normal", "stretch", "flex-start", "flex-end", "center", "space-between", "space-around"];
const ALIGN_SELF_OPTIONS = ["auto", "stretch", "flex-start", "flex-end", "center", "baseline"];

const FLEX_GROW_PRESETS = ["0", "1", "2", "3"];
const FLEX_SHRINK_PRESETS = ["0", "1"];
const FLEX_BASIS_PRESETS = ["auto", "0", "100%", "50%", "fit-content"];
const ORDER_PRESETS = ["-1", "0", "1", "2", "3"];
const GAP_PRESETS = ["0", "0.25rem", "0.5rem", "0.75rem", "1rem", "1.5rem", "2rem", "3rem"];
const FLEX_ALIGNMENT_OPTIONS = ["flex-start", "center", "flex-end"];
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
  const [position, setPosition] = useState(() => getStateStyleValue(el, "position", "static"));
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [flexDirection] = useComputedLayoutValue(el, "flex-direction", "row", layoutRevision);
  const [flexWrap] = useComputedLayoutValue(el, "flex-wrap", "nowrap", layoutRevision);
  const isFlexWrapped = flexWrap !== "nowrap";
  const relevantGap = flexDirection.startsWith("column") ? "row-gap" : "column-gap";

  function notifyAfterEdit(): void {
    setLayoutRevision((revision) => revision + 1);
    onAfterEdit?.();
  }

  useEffect(() => {
    try {
      const cs = getElementComputedStyle(el);
      const display = cs.display;
      setIsFlexContainer(display === "flex" || display === "inline-flex");
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
        return;
      }
      const pDisplay = getElementComputedStyle(parentEl).display;
      setIsFlexChild(pDisplay === "flex" || pDisplay === "inline-flex");
    } catch {
      setIsFlexChild(false);
    }
  }, [el, layoutRevision]);

  return (
    <div className="dt-editor" data-test="layout-section">
      <div className="dt-editor__title">Layout</div>
      <div className="dt-layout">
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

        <SizeSection
          domElement={el}
          entries={allEntries}
          tokenRows={tokenRows}
          revision={layoutRevision}
          onAfterEdit={notifyAfterEdit}
        />

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
                <span className="dt-layout__group-title">Gap</span>
                <div className={`dt-layout__gap-fields${isFlexWrapped ? "" : " dt-layout__gap-fields--single"}`}>
                  {isFlexWrapped ? (
                    <>
                      <LayoutComboField
                        property="row-gap"
                        presets={GAP_PRESETS}
                        domElement={el}
                        compact
                        inputOnly
                        revision={layoutRevision}
                        onAfterEdit={notifyAfterEdit}
                      />
                      <LayoutComboField
                        property="column-gap"
                        presets={GAP_PRESETS}
                        domElement={el}
                        compact
                        inputOnly
                        revision={layoutRevision}
                        onAfterEdit={notifyAfterEdit}
                      />
                    </>
                  ) : (
                    <LayoutComboField
                      property={relevantGap}
                      presets={GAP_PRESETS}
                      domElement={el}
                      compact
                      inputOnly
                      revision={layoutRevision}
                      onAfterEdit={notifyAfterEdit}
                    />
                  )}
                </div>
              </div>
            </div>
            <div className="dt-layout__flex-advanced">
              <LayoutDropdown
                property="justify-content"
                options={JUSTIFY_CONTENT_OPTIONS}
                domElement={el}
                stacked
                revision={layoutRevision}
                onAfterEdit={notifyAfterEdit}
              />
              <LayoutDropdown
                property="align-items"
                options={ALIGN_ITEMS_OPTIONS}
                domElement={el}
                stacked
                revision={layoutRevision}
                onAfterEdit={notifyAfterEdit}
              />
            </div>
          </div>
        ) : null}

        {isFlexChild ? (
          <div className="dt-layout__group" data-test="layout-flex-child">
            <div className="dt-layout__group-title">Flex Child</div>
            <LayoutDropdown
              property="align-self"
              options={ALIGN_SELF_OPTIONS}
              domElement={el}
              revision={layoutRevision}
              onAfterEdit={notifyAfterEdit}
            />
            <LayoutComboField
              property="flex-grow"
              presets={FLEX_GROW_PRESETS}
              domElement={el}
              revision={layoutRevision}
              onAfterEdit={notifyAfterEdit}
            />
            <LayoutComboField
              property="flex-shrink"
              presets={FLEX_SHRINK_PRESETS}
              domElement={el}
              revision={layoutRevision}
              onAfterEdit={notifyAfterEdit}
            />
            <LayoutComboField
              property="flex-basis"
              presets={FLEX_BASIS_PRESETS}
              domElement={el}
              revision={layoutRevision}
              onAfterEdit={notifyAfterEdit}
            />
            <LayoutComboField
              property="order"
              presets={ORDER_PRESETS}
              domElement={el}
              revision={layoutRevision}
              onAfterEdit={notifyAfterEdit}
            />
          </div>
        ) : null}

        {position === "absolute" || position === "fixed" ? (
          <PositionAnchorControls
            domElement={el}
            entries={allEntries}
            tokenRows={tokenRows}
            revision={layoutRevision}
            onAfterEdit={notifyAfterEdit}
          />
        ) : position === "relative" || position === "sticky" ? (
          <div className="dt-layout__group" data-test="layout-inset">
            <div className="dt-layout__group-title">Inset</div>
            <SideControls label="Inset" sides={SIDE_NAMES.map((side): SideValueSlot => ({
              side,
              control: (
                <TokenField
                  property={side}
                  tokenRow={tokenRows.find((row) => row.property === side) ?? null}
                  domElement={el}
                  entries={allEntries}
                  onAfterEdit={notifyAfterEdit}
                />
              ),
            }))} />
          </div>
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
  const fields = [
    { property: "width", presets: SIZE_PRESETS },
    { property: "height", presets: SIZE_PRESETS },
    { property: "min-width", presets: MIN_SIZE_PRESETS },
    { property: "min-height", presets: MIN_SIZE_PRESETS },
    { property: "max-width", presets: MAX_WIDTH_PRESETS },
    { property: "max-height", presets: MAX_HEIGHT_PRESETS },
  ];
  return (
    <div className="dt-layout__group dt-layout__size" data-test="layout-size">
      <div className="dt-layout__group-title">Size</div>
      <div className="dt-layout__size-grid">
        {fields.map(({ property, presets }) => (
          <FieldRow key={property} label={property} data-test={`layout-size-${property}`}>
            <TokenField
              property={property}
              tokenRow={tokenRows.find((row) => row.property === property) ?? null}
              initialValue={meaningfulLayoutValue(el, property)}
              domElement={el}
              entries={entries}
              suggestions={presets}
              onAfterEdit={onAfterEdit}
            />
          </FieldRow>
        ))}
      </div>
      <AspectRatioField
        domElement={el}
        entries={entries}
        tokenRow={tokenRows.find((row) => row.property === "aspect-ratio") ?? null}
        revision={revision}
        onAfterEdit={onAfterEdit}
      />
    </div>
  );
}

interface FlexControlProps {
  domElement: HTMLElement;
  revision?: number;
  onAfterEdit?: () => void;
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
    <div className="dt-layout__direction" role="group" aria-label="Flex direction">
      <Button
        size="compact"
        className="dt-layout__direction-button"
        data-active={orientation === "row"}
        data-test="layout-direction-row"
        aria-label="Set Flex Direction To Row"
        aria-pressed={orientation === "row"}
        onClick={() => selectDirection(`row${reverse ? "-reverse" : ""}`)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2 8h11M9 4l4 4-4 4" />
        </svg>
      </Button>
      <Button
        size="compact"
        className="dt-layout__direction-button"
        data-active={orientation === "column"}
        data-test="layout-direction-column"
        aria-label="Set Flex Direction To Column"
        aria-pressed={orientation === "column"}
        onClick={() => selectDirection(`column${reverse ? "-reverse" : ""}`)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 2v11M4 9l4 4 4-4" />
        </svg>
      </Button>
    </div>
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
      size="compact"
      className="dt-layout__wrap-button"
      data-active={isWrapped}
      data-test="layout-flex-wrap-toggle"
      label={isWrapped ? "Disable Flex Wrap" : "Enable Flex Wrap"}
      aria-pressed={isWrapped}
      onClick={toggleWrap}
    >
      <WrapText size={16} strokeWidth={1.8} aria-hidden="true" />
    </IconButton>
  );
}

function FlexSettingsMenu({ domElement, revision = 0, onAfterEdit }: FlexControlProps): ReactElement {
  const [direction] = useComputedLayoutValue(domElement, "flex-direction", "row", revision);
  const [wrap] = useComputedLayoutValue(domElement, "flex-wrap", "nowrap", revision);
  const [alignContent] = useComputedLayoutValue(domElement, "align-content", "normal", revision);
  const [open, setOpen] = useState(false);
  const orientation = direction.startsWith("column") ? "column" : "row";
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
      value: "justify-content:space-between",
      label: "space-between",
      trailing: "Justify Content",
      current: getStateStyleValue(domElement, "justify-content", "flex-start") === "space-between",
      "data-test": "layout-flex-setting-justify-space-between",
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
          size="compact"
          label="Flex settings"
          data-test="layout-flex-settings"
        >
          <Settings2 size={16} strokeWidth={1.8} aria-hidden="true" />
        </IconButton>
      )}
      triggerDataTest="layout-flex-settings"
      triggerAriaLabel="Flex settings"
      items={items.map((item) => ({
        value: item.value,
        label: item.label,
        trailing: item.trailing,
        leading: item.current ? <Check size={14} strokeWidth={2} aria-hidden="true" /> : undefined,
        "data-test": item["data-test"],
      }))}
      onQueryChange={() => undefined}
      onOpenChange={setOpen}
      onSelect={selectSetting}
    />
  );
}

function FlexAlignmentGrid({ domElement, revision = 0, onAfterEdit }: FlexControlProps): ReactElement {
  const [direction] = useComputedLayoutValue(domElement, "flex-direction", "row", revision);
  const [justify, setJustify] = useComputedLayoutValue(domElement, "justify-content", "flex-start", revision);
  const [align, setAlign] = useComputedLayoutValue(domElement, "align-items", "stretch", revision);
  const isColumn = direction.startsWith("column");
  const isReverse = direction.endsWith("-reverse");

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
    <div className="dt-layout__alignment-grid" role="group" aria-label="Flex alignment">
      {rowValues.flatMap((rowValue) =>
        columnValues.map((columnValue) => {
          const justifyValue = isColumn ? rowValue : columnValue;
          const alignValue = isColumn ? columnValue : rowValue;
          const active = justify === justifyValue && align === alignValue;
          return (
            <Button
              key={`${alignValue}-${justifyValue}`}
              size="compact"
              variant="quiet"
              className="dt-layout__alignment-button"
              data-active={active}
              data-test={`layout-align-${alignValue}-${justifyValue}`}
              aria-label={formatInspectorLabel(`Align ${alignValue.replace("flex-", "")} And Distribute ${justifyValue.replace("flex-", "")}`)}
              aria-pressed={active}
              onClick={() => selectAlignment(justifyValue, alignValue)}
            >
              <span />
            </Button>
          );
        }),
      )}
    </div>
  );
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
