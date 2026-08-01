import { useEffect, useRef, useState } from "react";
import type { SelectedElement } from "../selectionStore.ts";
import type { InteractionState } from "../styleState.ts";
import {
  getAvailableTokenTableForElement,
  getResolvedPropertiesForState,
} from "./resolution.ts";
import type { ResolvedProperty, TokenTable } from "./resolution.ts";
import {
  subscribeGlobalRevision,
} from "./resolution/cssomCollector.ts";

/**
 * Trailing-edge debounce window for panel resolution. Rapid re-selections
 * coalesce: only the last selection in the window resolves. The window is
 * intentionally small so a single selection reveals promptly while repeated
 * host edits still batch into one resolution.
 */
const DEBOUNCE_MS = 8;

/**
 * React adapter for the resolution engine. Keeping this outside the engine
 * lets parser and cascade tests import the production resolver without React.
 *
 * An edit commit bumps the global revision. The hook subscribes to that store
 * and re-resolves through the same debounce, so the panel refreshes after a
 * commit without recreating the selection identity. Unlike a synchronous
 * external-store re-render, the commit does not paint stale rows first: the
 * resolution result is committed directly, which keeps the edit-commit path
 * to a single panel render.
 */
export function useResolvedPropertiesDebounced(
  selected: SelectedElement | null,
  state: InteractionState = "base",
  tokenTable?: TokenTable,
): ResolvedProperty[] {
  const [rows, setRows] = useState<ResolvedProperty[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const latest = useRef({ selected, state, tokenTable });
  latest.current = { selected, state, tokenTable };

  function resolve(): void {
    const current = latest.current;
    if (!current.selected) {
      setRows([]);
      return;
    }
    setRows(getResolvedPropertiesForState(
      current.selected.domElement,
      current.tokenTable ?? getAvailableTokenTableForElement(current.selected.domElement),
      current.state,
    ));
  }

  function scheduleResolution(): void {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      resolve();
    }, DEBOUNCE_MS);
  }

  useEffect(() => {
    scheduleResolution();
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [selected, state, tokenTable]);

  useEffect(() => subscribeGlobalRevision(scheduleResolution), []);

  return rows;
}
