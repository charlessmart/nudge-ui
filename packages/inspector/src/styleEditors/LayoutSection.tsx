import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import type { SelectedElement } from "../selectionStore.ts";
import { LayoutDropdown } from "./LayoutDropdown.tsx";
import { LayoutComboField } from "./LayoutComboField.tsx";
import { setStyle } from "./styleActions.ts";
import { Button } from "../ui/Button.tsx";

const DISPLAY_OPTIONS = ["block", "inline", "inline-block", "flex", "inline-flex", "none", "contents"];
const POSITION_OPTIONS = ["static", "relative", "absolute", "fixed", "sticky"];
const FLEX_DIRECTION_OPTIONS = ["row", "row-reverse", "column", "column-reverse"];
const JUSTIFY_CONTENT_OPTIONS = ["flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly"];
const ALIGN_ITEMS_OPTIONS = ["stretch", "flex-start", "flex-end", "center", "baseline"];
const FLEX_WRAP_OPTIONS = ["nowrap", "wrap", "wrap-reverse"];
const ALIGN_CONTENT_OPTIONS = ["stretch", "flex-start", "flex-end", "center", "space-between", "space-around"];
const ALIGN_SELF_OPTIONS = ["auto", "stretch", "flex-start", "flex-end", "center", "baseline"];

const FLEX_GROW_PRESETS = ["0", "1", "2", "3"];
const FLEX_SHRINK_PRESETS = ["0", "1"];
const FLEX_BASIS_PRESETS = ["auto", "0", "100%", "50%", "fit-content"];
const ORDER_PRESETS = ["-1", "0", "1", "2", "3"];
const GAP_PRESETS = ["0", "0.25rem", "0.5rem", "0.75rem", "1rem", "1.5rem", "2rem", "3rem"];
const INSET_PRESETS = ["auto", "0", "50%", "100%"];
const FLEX_ALIGNMENT_OPTIONS = ["flex-start", "center", "flex-end"];

export interface LayoutSectionProps {
  element: SelectedElement;
  onAfterEdit?: () => void;
}

export function LayoutSection(props: LayoutSectionProps): ReactElement {
  const { element, onAfterEdit } = props;
  const el = element.domElement;

  const [isFlexContainer, setIsFlexContainer] = useState(false);
  const [isFlexChild, setIsFlexChild] = useState(false);
  const [isPositioned, setIsPositioned] = useState(false);
  const [layoutRevision, setLayoutRevision] = useState(0);

  function notifyAfterEdit(): void {
    setLayoutRevision((revision) => revision + 1);
    onAfterEdit?.();
  }

  useEffect(() => {
    try {
      const cs = getComputedStyle(el);
      const display = cs.display;
      setIsFlexContainer(display === "flex" || display === "inline-flex");
      setIsPositioned(
        cs.position === "absolute" ||
        cs.position === "fixed" ||
        cs.position === "relative" ||
        cs.position === "sticky",
      );
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
      const pDisplay = getComputedStyle(parentEl).display;
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

        {isFlexContainer ? (
          <div className="dt-layout__group" data-test="layout-flex-container">
            <div className="dt-layout__group-title">Flex</div>
            <div className="dt-layout__flex-toolbar">
              <FlexDirectionControl domElement={el} revision={layoutRevision} onAfterEdit={notifyAfterEdit} />
              <FlexAlignmentGrid domElement={el} revision={layoutRevision} onAfterEdit={notifyAfterEdit} />
            </div>
            <div className="dt-layout__flex-advanced">
              <LayoutDropdown
                property="justify-content"
                options={JUSTIFY_CONTENT_OPTIONS}
                domElement={el}
                revision={layoutRevision}
                onAfterEdit={notifyAfterEdit}
              />
              <LayoutDropdown
                property="align-items"
                options={ALIGN_ITEMS_OPTIONS}
                domElement={el}
                revision={layoutRevision}
                onAfterEdit={notifyAfterEdit}
              />
            </div>
            <div className="dt-layout__flex-settings">
              <LayoutDropdown
                property="flex-wrap"
                options={FLEX_WRAP_OPTIONS}
                domElement={el}
                revision={layoutRevision}
                onAfterEdit={notifyAfterEdit}
              />
              <LayoutDropdown
                property="align-content"
                options={ALIGN_CONTENT_OPTIONS}
                domElement={el}
                revision={layoutRevision}
                onAfterEdit={notifyAfterEdit}
              />
            </div>
            <div className="dt-layout__gap-row" data-test="layout-gap">
              <span className="dt-layout__group-title">Gap</span>
              <div className="dt-layout__gap-fields">
                <LayoutComboField
                  property="row-gap"
                  presets={GAP_PRESETS}
                  domElement={el}
                  compact
                  revision={layoutRevision}
                  onAfterEdit={notifyAfterEdit}
                />
                <LayoutComboField
                  property="column-gap"
                  presets={GAP_PRESETS}
                  domElement={el}
                  compact
                  revision={layoutRevision}
                  onAfterEdit={notifyAfterEdit}
                />
              </div>
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

        {isPositioned ? (
          <div className="dt-layout__group" data-test="layout-inset">
            <div className="dt-layout__group-title">Inset</div>
            <div className="dt-layout__inset-grid">
              <span className="dt-layout__inset-label">T</span>
              <LayoutComboField
                property="top"
                presets={INSET_PRESETS}
                domElement={el}
                compact
                revision={layoutRevision}
                onAfterEdit={notifyAfterEdit}
              />
              <span className="dt-layout__inset-label">R</span>
              <LayoutComboField
                property="right"
                presets={INSET_PRESETS}
                domElement={el}
                compact
                revision={layoutRevision}
                onAfterEdit={notifyAfterEdit}
              />
              <span className="dt-layout__inset-label">B</span>
              <LayoutComboField
                property="bottom"
                presets={INSET_PRESETS}
                domElement={el}
                compact
                revision={layoutRevision}
                onAfterEdit={notifyAfterEdit}
              />
              <span className="dt-layout__inset-label">L</span>
              <LayoutComboField
                property="left"
                presets={INSET_PRESETS}
                domElement={el}
                compact
                revision={layoutRevision}
                onAfterEdit={notifyAfterEdit}
              />
            </div>
          </div>
        ) : null}
      </div>
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
        aria-label="Set flex direction to row"
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
        aria-label="Set flex direction to column"
        aria-pressed={orientation === "column"}
        onClick={() => selectDirection(`column${reverse ? "-reverse" : ""}`)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 2v11M4 9l4 4 4-4" />
        </svg>
      </Button>
      <Button
        size="compact"
        variant="quiet"
        className="dt-layout__reverse-button"
        data-active={reverse}
        data-test="layout-direction-reverse"
        aria-label="Toggle reverse flex direction"
        aria-pressed={reverse}
        onClick={() => selectDirection(`${orientation}${reverse ? "" : "-reverse"}`)}
      >
        ↔
      </Button>
    </div>
  );
}

function FlexAlignmentGrid({ domElement, revision = 0, onAfterEdit }: FlexControlProps): ReactElement {
  const [justify, setJustify] = useComputedLayoutValue(domElement, "justify-content", "flex-start", revision);
  const [align, setAlign] = useComputedLayoutValue(domElement, "align-items", "stretch", revision);

  function selectAlignment(nextJustify: string, nextAlign: string): void {
    setJustify(nextJustify);
    setAlign(nextAlign);
    setStyle(domElement, "justify-content", nextJustify);
    setStyle(domElement, "align-items", nextAlign);
    onAfterEdit?.();
  }

  return (
    <div className="dt-layout__alignment-grid" role="group" aria-label="Flex alignment">
      {FLEX_ALIGNMENT_OPTIONS.flatMap((alignValue) =>
        FLEX_ALIGNMENT_OPTIONS.map((justifyValue) => {
          const active = justify === justifyValue && align === alignValue;
          return (
            <Button
              key={`${alignValue}-${justifyValue}`}
              size="compact"
              variant="quiet"
              className="dt-layout__alignment-button"
              data-active={active}
              data-test={`layout-align-${alignValue}-${justifyValue}`}
              aria-label={`Align ${alignValue.replace("flex-", "")} and distribute ${justifyValue.replace("flex-", "")}`}
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
  try {
    return getComputedStyle(domElement).getPropertyValue(property).trim() || fallback;
  } catch {
    return fallback;
  }
}
