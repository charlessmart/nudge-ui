import { useEffect, useState } from "react";
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

  useEffect(() => {
    const next = readValue();
    setValue(next);
    setDraft(next);
  }, [el, property, revision]);

  function commit(): void {
    const next = draft.trim();
    if (!next) {
      setDraft(value);
      return;
    }
    setValue(next);
    setDraft(next);
    if (setStyle(el, property, next)) onAfterEdit?.();
  }

  function cancel(): void {
    setDraft(value);
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
        onChange={(event) => setDraft(event.target.value)}
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
