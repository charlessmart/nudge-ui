import { useEffect, useState } from "react";
import type { SelectedElement } from "../selectionStore.ts";
import type { InteractionState } from "../styleState.ts";
import {
  getAvailableTokenTableForElement,
  getResolvedPropertiesForState,
} from "./resolution.ts";
import type { ResolvedProperty, TokenTable } from "./resolution.ts";

/**
 * React adapter for the resolution engine. Keeping this outside the engine
 * lets parser and cascade tests import the production resolver without React.
 */
export function useResolvedPropertiesDebounced(
  selected: SelectedElement | null,
  state: InteractionState = "base",
  tokenTable?: TokenTable,
): ResolvedProperty[] {
  const [rows, setRows] = useState<ResolvedProperty[]>([]);
  useEffect(() => {
    if (!selected) {
      setRows([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      if (cancelled) return;
      setRows(getResolvedPropertiesForState(
        selected.domElement,
        tokenTable ?? getAvailableTokenTableForElement(selected.domElement),
        state,
      ));
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [selected, state, tokenTable]);
  return rows;
}
