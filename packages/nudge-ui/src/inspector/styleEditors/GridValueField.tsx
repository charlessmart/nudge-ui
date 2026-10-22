import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { FieldRow } from "../ui/FieldRow.tsx";
import { TextInput } from "../ui/TextInput.tsx";
import { getLayoutValue } from "./layoutValue.ts";
import { setStyle } from "../tokens/editActions.ts";
import { useFieldAtRules } from "../ui/AtRuleContext.tsx";
import { InlineStyleBlockedTooltip } from "../ui/InlineStyleWarning.tsx";
import type { StringRecord } from "./stringRecord.ts";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";
import { inlineBlockedBy } from "./inlineAuthored.ts";

const DEFAULT_GRID_VALUES: StringRecord = {
  "grid-template-columns": "none",
  "grid-template-rows": "none",
  "grid-auto-columns": "auto",
  "grid-auto-rows": "auto",
  "grid-column": "auto",
  "grid-row": "auto",
};

export interface GridValueFieldProps {
  property: string;
  domElement: HTMLElement;
  editTarget?: EditTarget;
  selection?: StyleSelection | null;
  revision?: number;
  onAfterEdit?: () => void;
}

/** Grid track lists and line placement are not safely decomposable into numeric controls. */
export function GridValueField({
  property,
  domElement: el,
  editTarget,
  selection,
  revision = 0,
  onAfterEdit,
}: GridValueFieldProps): ReactElement {
  const atRules = useFieldAtRules(property);
  const mixed = selection?.getProperty(property)?.value.kind === "mixed";
  const blockedBy = inlineBlockedBy(selection?.domElements ?? [el], property);
  const readValue = (): string => {
    const value = getLayoutValue(el, property);
    return value.authored || value.computed || DEFAULT_GRID_VALUES[property] || "";
  };
  const [value, setValue] = useState(readValue);
  const [draft, setDraft] = useState(value);
  // Commit reads the ref, not state: Escape reverts then blurs in one event, before React re-renders.
  const draftRef = useRef(value);

  useEffect(() => {
    const next = readValue();
    setValue(next);
    updateDraft(mixed ? "" : next);
  }, [el, mixed, property, revision]);

  function updateDraft(next: string): void {
    draftRef.current = next;
    setDraft(next);
  }

  function commit(): void {
    if (blockedBy) return;
    const next = draftRef.current.trim();
    if (!next) {
      updateDraft(mixed ? "" : value);
      return;
    }
    setValue(next);
    updateDraft(next);
    if (setStyle(editTarget ?? el, property, next)) onAfterEdit?.();
  }

  function cancel(): void {
    updateDraft(mixed ? "" : value);
  }

  return (
    <FieldRow
      label={property}
      property={property}
      atRules={atRules}
      data-test={`layout-grid-${property}`}
    >
      <InlineStyleBlockedTooltip blockedBy={blockedBy}>
        <TextInput
          value={draft}
          placeholder={mixed ? "Mixed" : undefined}
          data-test={`layout-grid-input-${property}`}
          aria-label={property}
          disabled={blockedBy !== null}
          onChange={(event) => updateDraft(event.target.value)}
          onBlur={() => {
            commit();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
              event.currentTarget.blur();
            } else if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
      </InlineStyleBlockedTooltip>
    </FieldRow>
  );
}
