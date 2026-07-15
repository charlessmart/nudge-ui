import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { setStyle } from "./styleActions.ts";
import { Select } from "../ui/Select.tsx";
import { TextInput } from "../ui/TextInput.tsx";

const CUSTOM_KEY = "__custom__";

export interface LayoutComboFieldProps {
  property: string;
  presets: string[];
  domElement: HTMLElement;
  compact?: boolean;
  onAfterEdit?: () => void;
}

export function LayoutComboField(props: LayoutComboFieldProps): ReactElement {
  const { property, presets, domElement: el, compact, onAfterEdit } = props;

  const [currentValue, setCurrentValue] = useState(() =>
    getComputedStyle(el).getPropertyValue(property).trim(),
  );
  const [customValue, setCustomValue] = useState(currentValue);
  const [showCustom, setShowCustom] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const cv = getComputedStyle(el).getPropertyValue(property).trim();
      setCurrentValue(cv);
      setCustomValue(cv);
    } catch {
      // noop
    }
  }, [el, property]);

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
      commit(trimmed);
    } else {
      setCustomValue(currentValue);
    }
    setShowCustom(false);
  }

  function handleCustomKeyDown(e: React.KeyboardEvent): void {
    if (e.key === "Enter") {
      handleCustomApply();
    } else if (e.key === "Escape") {
      setCustomValue(currentValue);
      setShowCustom(false);
    }
  }

  const selectValue = inPresets ? currentValue : CUSTOM_KEY;

  return (
    <span
      className={`dt-layout-combo${compact ? " dt-layout-combo--compact" : ""}`}
      data-test="layout-combo"
      data-property={property}
    >
      <Select
        compact={compact}
        data-test={`layout-combo-select-${property}`}
        value={selectValue}
        options={[
          ...presets.map((p) => ({ value: p, label: p })),
          { value: CUSTOM_KEY, label: "Custom…" },
        ]}
        onValueChange={handleSelectChange}
      />
      {showCustom ? (
        <span className="dt-layout-combo__custom">
          <TextInput
            ref={customInputRef}
            compact={compact}
            data-test={`layout-combo-input-${property}`}
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onBlur={handleCustomApply}
            onKeyDown={handleCustomKeyDown}
          />
        </span>
      ) : null}
    </span>
  );
}
