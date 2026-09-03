import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { FieldRow } from "../ui/FieldRow.tsx";
import { TextInput } from "../ui/TextInput.tsx";
import { getLayoutValue } from "./layoutValue.ts";
import { setStyle } from "./styleActions.ts";
import { useFieldAtRules } from "../ui/AtRuleContext.tsx";
import type { StringRecord } from "./stringRecord.ts";

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
  revision?: number;
  onAfterEdit?: () => void;
}

/**
 * Raw CSS editor for Grid grammar. Track lists and line placement are not
 * safely decomposable into numeric controls, so the authored expression is
 * retained verbatim and committed as one managed longhand.
 */
export function GridValueField({
  property,
  domElement: el,
  revision = 0,
  onAfterEdit,
}: GridValueFieldProps): ReactElement {
  const atRules = useFieldAtRules(property);
  const readValue = (): string => {
    const value = getLayoutValue(el, property);
    return value.authored || value.computed || DEFAULT_GRID_VALUES[property] || "";
  };
  const [value, setValue] = useState(readValue);
  const [draft, setDraft] = useState(value);
  // Commit reads the ref, not state: Escape reverts the draft and then blurs
  // within the same event, before React re-renders, so a state-only read
  // would commit the pre-escape draft.
  const draftRef = useRef(value);

  useEffect(() => {
    const next = readValue();
    setValue(next);
    updateDraft(next);
  }, [el, property, revision]);

  function updateDraft(next: string): void {
    draftRef.current = next;
    setDraft(next);
  }

  function commit(): void {
    const next = draftRef.current.trim();
    if (!next) {
      updateDraft(value);
      return;
    }
    setValue(next);
    updateDraft(next);
    if (setStyle(el, property, next)) onAfterEdit?.();
  }

  function cancel(): void {
    updateDraft(value);
  }

  return (
    <FieldRow
      label={property}
      property={property}
      atRules={atRules}
      data-test={`layout-grid-${property}`}
    >
      <TextInput
        value={draft}
        data-test={`layout-grid-input-${property}`}
        aria-label={property}
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
    </FieldRow>
  );
}
