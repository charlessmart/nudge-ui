import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { setStyle } from "../tokens/editActions.ts";
import { completeCssValue } from "./completeCssValue.ts";
import { sameEditTarget, useValueDraft } from "./valueField.ts";
import { valuePolicyFor } from "./valuePolicy.ts";
import { meaningfulLayoutValue } from "./layoutValue.ts";
import { inlineBlockedBy } from "./inlineAuthored.ts";
import { LayoutBlockedIndicator } from "./LayoutBlockedIndicator.tsx";
import { Select } from "../ui/Select.tsx";
import { InlineStyleBlockedTooltip } from "../ui/InlineStyleWarning.tsx";
import { TextInput } from "../ui/TextInput.tsx";
import { cx } from "../ui/classNames.ts";
import { formatInspectorLabel } from "../ui/labels.ts";
import { AtRuleIndicator, useFieldAtRules } from "../ui/AtRuleContext.tsx";
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
  inputOnly?: boolean;
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
    inputOnly,
    revision = 0,
    onAfterEdit,
  } = props;
  const atRules = useFieldAtRules(property);
  const mixed = selection?.getProperty(property)?.value.kind === "mixed";

  const [currentValue, setCurrentValue] = useState(() =>
    meaningfulLayoutValue(el, property),
  );
  const [showCustom, setShowCustom] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);
  const pendingProjectionRef = useRef<PendingProjection | null>(null);
  const targetElements = selection?.domElements ?? el;
  const targetRef = useRef({ targetElements, property });
  const projectionAcknowledgementVersion = useSyncExternalStore(
    subscribeCanvasProjectionAcknowledgements,
    getCanvasProjectionAcknowledgementVersion,
    getCanvasProjectionAcknowledgementVersion,
  );

  const blockedBy = inlineBlockedBy(selection?.domElements ?? [el], property);

  function commit(value: string): void {
    if (blockedBy) return;
    setCurrentValue(value);
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

  const field = useValueDraft({
    value: mixed ? "" : currentValue,
    mixed,
    blocked: blockedBy !== null,
    property,
    resetKey: targetElements,
    complete: (value) => completeCssValue(value, valuePolicyFor(property)),
    onCommit: commit,
    commitOnNudge: true,
  });
  const dirty = field.isDirty();

  useEffect(() => {
    const targetChanged = !sameEditTarget(targetRef.current.targetElements, targetElements)
      || targetRef.current.property !== property;
    targetRef.current = { targetElements, property };
    if (targetChanged) pendingProjectionRef.current = null;
    try {
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

      // The same target keeps the user's draft; a new target always starts from its own value.
      if (!targetChanged && dirty) return;
      setCurrentValue(meaningfulLayoutValue(el, property));
    } catch {}
  }, [dirty, el, property, revision, projectionAcknowledgementVersion, targetElements]);

  const inPresets = presets.includes(currentValue);

  function handleCustomBlur(): void {
    field.commit();
    setShowCustom(false);
  }

  const selectValue = mixed ? CUSTOM_KEY : inPresets ? currentValue : CUSTOM_KEY;
  const customInput = (
    <TextInput
      ref={customInputRef}
      inputMode="decimal"
      placeholder={mixed ? "Mixed" : "0"}
      aria-label={formatInspectorLabel(property)}
      data-test={`layout-combo-input-${property}`}
      value={field.draft}
      disabled={blockedBy !== null}
      onChange={(e) => field.setDraft(e.target.value)}
      onBlur={handleCustomBlur}
      onKeyDown={field.handleKeyDown}
    />
  );

  return (
    <span
      className={cx("layout-combo", blockedBy && "layout-combo--blocked")}
      data-test="layout-combo"
      data-property={property}
    >
      {inputOnly ? customInput : (
        <>
          <InlineStyleBlockedTooltip blockedBy={blockedBy}>
            <Select
              data-test={`layout-combo-select-${property}`}
              value={selectValue}
              options={[
                ...presets.map((p) => ({ value: p, label: formatInspectorLabel(p) })),
                { value: CUSTOM_KEY, label: "Custom…" },
              ]}
              onValueChange={handleSelectChange}
              disabled={blockedBy !== null}
            />
          </InlineStyleBlockedTooltip>
          {showCustom ? (
            <span className="layout-combo__custom">{customInput}</span>
          ) : null}
        </>
      )}
      <AtRuleIndicator atRules={atRules} />
      {inputOnly ? <LayoutBlockedIndicator blockedBy={blockedBy} /> : null}
    </span>
  );
}
