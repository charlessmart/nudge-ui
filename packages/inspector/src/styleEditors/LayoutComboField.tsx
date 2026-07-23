import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { setStyle } from "./styleActions.ts";
import { completeCssValue } from "./completeCssValue.ts";
import { nudgeCssValue } from "./nudgeValue.ts";
import { valuePolicyFor } from "./valuePolicy.ts";
import { Select } from "../ui/Select.tsx";
import { TextInput } from "../ui/TextInput.tsx";
import { getStateStyleValue } from "../stateValue.ts";
import { formatInspectorLabel } from "../ui/labels.ts";

const CUSTOM_KEY = "__custom__";

export interface LayoutComboFieldProps {
  property: string;
  presets: string[];
  domElement: HTMLElement;
  compact?: boolean;
  inputOnly?: boolean;
  revision?: number;
  onAfterEdit?: () => void;
}

export function LayoutComboField(props: LayoutComboFieldProps): ReactElement {
  const { property, presets, domElement: el, compact, inputOnly, revision = 0, onAfterEdit } = props;

  const [currentValue, setCurrentValue] = useState(() =>
    getStateStyleValue(el, property),
  );
  const [customValue, setCustomValue] = useState(currentValue);
  const [showCustom, setShowCustom] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const cv = getStateStyleValue(el, property);
      setCurrentValue(cv);
      setCustomValue(cv);
    } catch {
      // noop
    }
  }, [el, property, revision]);

  const inPresets = presets.includes(currentValue);

  function commit(value: string): void {
    setCurrentValue(value);
    setCustomValue(value);
    setStyle(el, property, value);
    onAfterEdit?.();
  }

  function handleSelectChange(val: string): void {
    if (val === CUSTOM_KEY) {
      setShowCustom(true);
      setTimeout(() => customInputRef.current?.focus(), 0);
      return;
    }
    setShowCustom(false);
    commit(val);
  }

  function handleCustomApply(): void {
    const trimmed = customValue.trim();
    if (trimmed) {
      commit(completeCssValue(trimmed, valuePolicyFor(property)));
    } else {
      setCustomValue(currentValue);
    }
    setShowCustom(false);
  }

  function handleCustomKeyDown(e: React.KeyboardEvent): void {
    const direction = arrowDirection(e.key);
    if (direction && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const next = nudgeCssValue(property, customValue, direction, e.shiftKey);
      if (next) {
        e.preventDefault();
        e.stopPropagation();
        commit(next);
        return;
      }
    }
    if (e.key === "Enter") {
      handleCustomApply();
    } else if (e.key === "Escape") {
      setCustomValue(currentValue);
      setShowCustom(false);
    }
  }

  const selectValue = inPresets ? currentValue : CUSTOM_KEY;
  const customInput = (
    <TextInput
      ref={customInputRef}
      compact={compact}
      inputMode="decimal"
      placeholder="0"
      data-test={`layout-combo-input-${property}`}
      value={customValue}
      onChange={(e) => setCustomValue(e.target.value)}
      onBlur={handleCustomApply}
      onKeyDown={handleCustomKeyDown}
    />
  );

  return (
    <span
      className={`dt-layout-combo${compact ? " dt-layout-combo--compact" : ""}`}
      data-test="layout-combo"
      data-property={property}
    >
      {inputOnly ? customInput : (
        <>
          <Select
            compact={compact}
            data-test={`layout-combo-select-${property}`}
            value={selectValue}
            options={[
              ...presets.map((p) => ({ value: p, label: formatInspectorLabel(p) })),
              { value: CUSTOM_KEY, label: "Custom…" },
            ]}
            onValueChange={handleSelectChange}
          />
          {showCustom ? (
            <span className="dt-layout-combo__custom">{customInput}</span>
          ) : null}
        </>
      )}
    </span>
  );
}

function arrowDirection(key: string): -1 | 1 | null {
  if (key === "ArrowUp" || key === "ArrowRight") return 1;
  if (key === "ArrowDown" || key === "ArrowLeft") return -1;
  return null;
}
