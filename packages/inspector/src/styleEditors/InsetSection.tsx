import type { ReactElement } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "@nudge-ui/css/model";
import type { SelectedElement } from "../selectionStore.ts";
import { getStateStyleValue } from "../stateValue.ts";
import { projectInspectorValues } from "../spacing/projection.ts";
import { SpacingField } from "./SpacingBox.tsx";

export interface InsetSectionProps {
  element: SelectedElement;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  onAfterEdit?: () => void;
}

/**
 * Keeps the positioned-element inset editor available as a standalone
 * section for callers that render it outside SpacingBox.
 */
export function InsetSection({
  element,
  entries = [],
  tokenRows = [],
  onAfterEdit,
}: InsetSectionProps): ReactElement | null {
  const el = element.domElement;
  const position = getStateStyleValue(el, "position", "static").trim().toLowerCase();
  if (position !== "relative" && position !== "sticky") return null;

  return (
    <SpacingField
      property="inset"
      projection={projectInspectorValues(el, tokenRows).spacing.inset}
      domElement={el}
      entries={entries}
      tokenRows={tokenRows}
      onAfterEdit={onAfterEdit}
    />
  );
}
