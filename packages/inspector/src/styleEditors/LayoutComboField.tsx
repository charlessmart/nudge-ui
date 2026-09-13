import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { setStyle } from "../tokens/editActions.ts";
import { completeCssValue } from "./completeCssValue.ts";
import { nudgeCssValue } from "./nudgeValue.ts";
import { valuePolicyFor } from "./valuePolicy.ts";
import { inlineAuthoredValue, meaningfulLayoutValue } from "./layoutValue.ts";
import { LayoutBlockedIndicator } from "./LayoutBlockedIndicator.tsx";
import { Select } from "../ui/Select.tsx";
import { TextInput } from "../ui/TextInput.tsx";
import { formatInspectorLabel } from "../ui/labels.ts";
import { AtRuleIndicator, useFieldAtRules } from "../ui/AtRuleContext.tsx";
import type { ControlAppearance } from "../ui/ControlSurface.tsx";
import {
  getCanvasProjectionAcknowledgementVersion,
  getCanvasProjectionStatus,
  subscribeCanvasProjectionAcknowledgements,
} from "../canvas/projection.ts";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";

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
  editTarget?: EditTarget;
  selection?: StyleSelection | null;
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
    editTarget,
    selection,
    compact,
    inputOnly,
    alwaysShowInput,
    appearance = "default",
    revision = 0,
    onAfterEdit,
  } = props;
  const atRules = useFieldAtRules(property);
  const mixed = selection?.getProperty(property)?.value.kind === "mixed";

  const [currentValue, setCurrentValue] = useState(() =>
    meaningfulLayoutValue(el, property),
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

      const cv = meaningfulLayoutValue(el, property);
      setCurrentValue(cv);
      setCustomValue(mixed ? "" : cv);
    } catch {
      // noop
    }
  }, [el, mixed, property, revision, projectionAcknowledgementVersion]);

  const inPresets = presets.includes(currentValue);

  // Inline styles always beat managed-stylesheet previews in the cascade, so
  // an inline-authored property can never preview. Present the field as
  // blocked (with the reason) instead of accepting edits that silently snap
  // back to the computed value on the next revision. Recomputed every render
  // so external style-attribute edits update the field without a remount.
  const blockedBy = inlineAuthoredValue(el, property);

  function commit(value: string): void {
    if (blockedBy) return;
    setCurrentValue(value);
    setCustomValue(value);
    draftDirtyRef.current = false;
    pendingProjectionRef.current = null;
    const change = setStyle(editTarget ?? el, property, value);
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
      setCustomValue(mixed ? "" : currentValue);
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
      setCustomValue(mixed ? "" : currentValue);
      setShowCustom(false);
    }
  }

  const selectValue = mixed ? CUSTOM_KEY : inPresets ? currentValue : CUSTOM_KEY;
  const customInput = (
    <TextInput
      ref={customInputRef}
      compact={compact}
      appearance={appearance}
      inputMode="decimal"
      placeholder={mixed ? "Mixed" : "0"}
      aria-label={formatInspectorLabel(property)}
      data-test={`layout-combo-input-${property}`}
      value={customValue}
      disabled={blockedBy !== null}
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
      className={`layout-combo${compact ? " layout-combo--compact" : ""}${blockedBy ? " layout-combo--blocked" : ""}`}
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
            disabled={blockedBy !== null}
          />
          {showCustom || alwaysShowInput ? (
            <span className="layout-combo__custom">{customInput}</span>
          ) : null}
        </>
      )}
      <AtRuleIndicator atRules={atRules} />
      {blockedBy ? <LayoutBlockedIndicator blockedBy={blockedBy} /> : null}
    </span>
  );
}

function arrowDirection(key: string): -1 | 1 | null {
  if (key === "ArrowUp" || key === "ArrowRight") return 1;
  if (key === "ArrowDown" || key === "ArrowLeft") return -1;
  return null;
}
