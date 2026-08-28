import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { setStyle } from "./styleActions.ts";
import { completeCssValue } from "./completeCssValue.ts";
import { nudgeCssValue } from "./nudgeValue.ts";
import { valuePolicyFor } from "./valuePolicy.ts";
import { Select } from "../ui/Select.tsx";
import { TextInput } from "../ui/TextInput.tsx";
import { getStateStyleValue } from "../stateValue.ts";
import { formatInspectorLabel } from "../ui/labels.ts";
import { AtRuleIndicator, useFieldAtRules } from "../ui/AtRuleContext.tsx";
import type { ControlAppearance } from "../ui/ControlSurface.tsx";
import {
  getCanvasProjectionAcknowledgementVersion,
  getCanvasProjectionStatus,
  subscribeCanvasProjectionAcknowledgements,
} from "../canvas/projection.ts";

const CUSTOM_KEY = "__custom__";

interface PendingProjection {
  document: Document;
  property: string;
  revision: number;
}

export interface LayoutComboFieldProps {
  property: string;
  presets: string[];
  domElement: HTMLElement;
  compact?: boolean;
  inputOnly?: boolean;
  alwaysShowInput?: boolean;
  appearance?: ControlAppearance;
  revision?: number;
  onAfterEdit?: () => void;
}

export function LayoutComboField(props: LayoutComboFieldProps): ReactElement {
  const {
    property,
    presets,
    domElement: el,
    compact,
    inputOnly,
    alwaysShowInput,
    appearance = "default",
    revision = 0,
    onAfterEdit,
  } = props;
  const atRules = useFieldAtRules(property);

  const [currentValue, setCurrentValue] = useState(() =>
    getStateStyleValue(el, property),
  );
  const [customValue, setCustomValue] = useState(currentValue);
  const [showCustom, setShowCustom] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);
  const draftDirtyRef = useRef(false);
  const pendingProjectionRef = useRef<PendingProjection | null>(null);
  const projectionAcknowledgementVersion = useSyncExternalStore(
    subscribeCanvasProjectionAcknowledgements,
    getCanvasProjectionAcknowledgementVersion,
    getCanvasProjectionAcknowledgementVersion,
  );

  useEffect(() => {
    draftDirtyRef.current = false;
    pendingProjectionRef.current = null;
  }, [el, property]);

  useEffect(() => {
    try {
      if (draftDirtyRef.current) return;

      const pending = pendingProjectionRef.current;
      if (pending && (pending.document !== el.ownerDocument || pending.property !== property)) {
        pendingProjectionRef.current = null;
      } else if (pending) {
        const status = getCanvasProjectionStatus(el.ownerDocument);
        const waitingForProjection = status !== null
          && status.sentRevision >= pending.revision
          && status.appliedRevision < pending.revision;
        if (waitingForProjection) return;
        pendingProjectionRef.current = null;
      }

      const cv = getStateStyleValue(el, property);
      setCurrentValue(cv);
      setCustomValue(cv);
    } catch {
      // noop
    }
  }, [el, property, revision, projectionAcknowledgementVersion]);

  const inPresets = presets.includes(currentValue);

  function commit(value: string): void {
    setCurrentValue(value);
    setCustomValue(value);
    draftDirtyRef.current = false;
    pendingProjectionRef.current = null;
    const change = setStyle(el, property, value);
    if (change) {
      const status = getCanvasProjectionStatus(el.ownerDocument);
      if (status && status.sentRevision > status.appliedRevision) {
        pendingProjectionRef.current = {
          document: el.ownerDocument,
          property,
          revision: status.sentRevision,
        };
      }
    }
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
      draftDirtyRef.current = false;
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
      draftDirtyRef.current = false;
      setCustomValue(currentValue);
      setShowCustom(false);
    }
  }

  const selectValue = inPresets ? currentValue : CUSTOM_KEY;
  const customInput = (
    <TextInput
      ref={customInputRef}
      compact={compact}
      appearance={appearance}
      inputMode="decimal"
      placeholder="0"
      aria-label={formatInspectorLabel(property)}
      data-test={`layout-combo-input-${property}`}
      value={customValue}
      onChange={(e) => {
        draftDirtyRef.current = true;
        setCustomValue(e.target.value);
      }}
      onBlur={handleCustomApply}
      onKeyDown={handleCustomKeyDown}
    />
  );

  return (
    <span
      className={`layout-combo${compact ? " layout-combo--compact" : ""}`}
      data-test="layout-combo"
      data-property={property}
    >
      {inputOnly ? customInput : (
        <>
          <Select
            compact={compact}
            appearance={appearance}
            data-test={`layout-combo-select-${property}`}
            value={selectValue}
            options={[
              ...presets.map((p) => ({ value: p, label: formatInspectorLabel(p) })),
              { value: CUSTOM_KEY, label: "Custom…" },
            ]}
            onValueChange={handleSelectChange}
          />
          {showCustom || alwaysShowInput ? (
            <span className="layout-combo__custom">{customInput}</span>
          ) : null}
        </>
      )}
      <AtRuleIndicator atRules={atRules} />
    </span>
  );
}

function arrowDirection(key: string): -1 | 1 | null {
  if (key === "ArrowUp" || key === "ArrowRight") return 1;
  if (key === "ArrowDown" || key === "ArrowLeft") return -1;
  return null;
}
