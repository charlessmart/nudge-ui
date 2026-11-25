import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { setStyles, type StyleDeclaration, type StyleEditMetadata } from "../tokens/editActions.ts";
import { getStateStyleValue } from "../shell/stateValue.ts";
import { AtRuleIndicator, useFieldAtRules } from "../ui/AtRuleContext.tsx";
import { InlineStyleBlockedTooltip } from "../ui/InlineStyleWarning.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import type { EditTarget } from "../selection/editTarget.ts";
import { inlineBlockedBy } from "./inlineAuthored.ts";

export interface TextSegmentOption {
  value: string;
  label: string;
  icon: ReactElement;
}

export interface TextSegmentedFieldProps {
  property: string;
  label: string;
  element: HTMLElement;
  elements: readonly HTMLElement[];
  editTarget: EditTarget;
  defaultValue: string;
  options: TextSegmentOption[];
  /** Prefixes each segment's test id, followed by the property and value. */
  testIdPrefix?: string;
  /** Source facts carried by the edit, as the field's token row records them. */
  editMetadata?: StyleEditMetadata;
  /** Advances when the element's styles are resolved again, so the control follows an undo or another field's write. */
  revision?: number;
  /** The declarations a segment writes, when that is not `property: value`, such as the shorthand of the longhand it reads. */
  write?: (value: string) => StyleDeclaration[];
  /** Disables the control, saying why in a tooltip, such as a property this browser does not support. */
  disabledReason?: string;
}

/** A keyword property picked from icon segments; a value with no segment, or a selection that disagrees, selects none. */
export function TextSegmentedField(props: TextSegmentedFieldProps): ReactElement {
  const {
    property, label, element, elements, editTarget, defaultValue, options,
    testIdPrefix = "typography-align", editMetadata, revision = 0, write, disabledReason,
  } = props;
  const atRules = useFieldAtRules(property);
  const blockedBy = inlineBlockedBy(elements, property);
  const disabled = blockedBy !== null || disabledReason !== undefined;
  const readOne = (target: HTMLElement) => normalizeKeyword(property, getStateStyleValue(target, property, defaultValue));
  const readValues = () => elements.map(readOne);
  const initialValues = readValues();
  const isMixed = initialValues.some((value) => value !== initialValues[0]);
  const [current, setCurrent] = useState<string | null>(() => isMixed ? null : readOne(element));

  useEffect(() => {
    const values = readValues();
    setCurrent(values.some((value) => value !== values[0]) ? null : readOne(element));
  }, [defaultValue, element, elements, property, revision]);

  function handleChange(value: string): void {
    if (disabled) return;
    setCurrent(value);
    setStyles(editTarget, write ? write(value) : [{ property, value }], editMetadata);
  }

  const control = (
    <SegmentedControl
      value={current}
      aria-label={label}
      data-property={property}
      disabled={disabled}
      tooltips
      options={options.map((option) => ({
        value: option.value,
        label: option.label,
        icon: option.icon,
        testId: `${testIdPrefix}-${property}-${option.value}`,
      }))}
      onChange={handleChange}
    />
  );

  return (
    <div className="typography__alignment-field">
      {isMixed || current === null && elements.length > 1 ? (
        <span className="typography__mixed" data-test={`typography-mixed-${property}`}>Mixed</span>
      ) : null}
      {disabledReason !== undefined && blockedBy === null ? (
        <Tooltip content={disabledReason} stableTrigger>{control}</Tooltip>
      ) : (
        <InlineStyleBlockedTooltip blockedBy={blockedBy}>{control}</InlineStyleBlockedTooltip>
      )}
      <AtRuleIndicator atRules={atRules} />
    </div>
  );
}

/** Reads computed keywords as the segment that shows them: `start` and `end` as the left and right of a left-to-right page. */
function normalizeKeyword(property: string, value: string): string {
  if (property !== "text-align") return value;
  if (value === "start") return "left";
  if (value === "end") return "right";
  return value;
}
