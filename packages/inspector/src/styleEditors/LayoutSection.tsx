import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import type { SelectedElement } from "../selectionStore.ts";
import { LayoutDropdown } from "./LayoutDropdown.tsx";
import { LayoutComboField } from "./LayoutComboField.tsx";

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
  }, [el]);

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
  }, [el]);

  return (
    <div className="dt-editor" data-test="layout-section">
      <div className="dt-editor__title">Layout</div>
      <div className="dt-layout">
        <LayoutDropdown
          property="display"
          options={DISPLAY_OPTIONS}
          domElement={el}
          onAfterEdit={onAfterEdit}
        />
        <LayoutDropdown
          property="position"
          options={POSITION_OPTIONS}
          domElement={el}
          onAfterEdit={onAfterEdit}
        />

        {isFlexContainer ? (
          <div className="dt-layout__group" data-test="layout-flex-container">
            <div className="dt-layout__group-title">Flex Container</div>
            <LayoutDropdown
              property="flex-direction"
              options={FLEX_DIRECTION_OPTIONS}
              domElement={el}
              onAfterEdit={onAfterEdit}
            />
            <LayoutDropdown
              property="justify-content"
              options={JUSTIFY_CONTENT_OPTIONS}
              domElement={el}
              onAfterEdit={onAfterEdit}
            />
            <LayoutDropdown
              property="align-items"
              options={ALIGN_ITEMS_OPTIONS}
              domElement={el}
              onAfterEdit={onAfterEdit}
            />
            <LayoutDropdown
              property="flex-wrap"
              options={FLEX_WRAP_OPTIONS}
              domElement={el}
              onAfterEdit={onAfterEdit}
            />
            <LayoutDropdown
              property="align-content"
              options={ALIGN_CONTENT_OPTIONS}
              domElement={el}
              onAfterEdit={onAfterEdit}
            />
            <div className="dt-layout__gap-row" data-test="layout-gap">
              <span className="dt-layout__group-title">Gap</span>
              <div className="dt-layout__gap-fields">
                <LayoutComboField
                  property="row-gap"
                  presets={GAP_PRESETS}
                  domElement={el}
                  compact
                  onAfterEdit={onAfterEdit}
                />
                <LayoutComboField
                  property="column-gap"
                  presets={GAP_PRESETS}
                  domElement={el}
                  compact
                  onAfterEdit={onAfterEdit}
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
              onAfterEdit={onAfterEdit}
            />
            <LayoutComboField
              property="flex-grow"
              presets={FLEX_GROW_PRESETS}
              domElement={el}
              onAfterEdit={onAfterEdit}
            />
            <LayoutComboField
              property="flex-shrink"
              presets={FLEX_SHRINK_PRESETS}
              domElement={el}
              onAfterEdit={onAfterEdit}
            />
            <LayoutComboField
              property="flex-basis"
              presets={FLEX_BASIS_PRESETS}
              domElement={el}
              onAfterEdit={onAfterEdit}
            />
            <LayoutComboField
              property="order"
              presets={ORDER_PRESETS}
              domElement={el}
              onAfterEdit={onAfterEdit}
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
                onAfterEdit={onAfterEdit}
              />
              <span className="dt-layout__inset-label">R</span>
              <LayoutComboField
                property="right"
                presets={INSET_PRESETS}
                domElement={el}
                compact
                onAfterEdit={onAfterEdit}
              />
              <span className="dt-layout__inset-label">B</span>
              <LayoutComboField
                property="bottom"
                presets={INSET_PRESETS}
                domElement={el}
                compact
                onAfterEdit={onAfterEdit}
              />
              <span className="dt-layout__inset-label">L</span>
              <LayoutComboField
                property="left"
                presets={INSET_PRESETS}
                domElement={el}
                compact
                onAfterEdit={onAfterEdit}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
