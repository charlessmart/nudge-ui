import { useEffect, useRef, useState } from "react";
import type { SelectedElement } from "../selectionStore.ts";
import type { InteractionState } from "../styleState.ts";
import {
  getBrowserCssInspection,
} from "../inspection/browserCssInspectionRegistry.ts";
import type { BrowserCssInspection } from "../inspection/browserCssInspection.ts";
import type { ResolvedProperty, TokenTable } from "./resolution.ts";

/**
 * Trailing-edge debounce window for panel resolution. Rapid re-selections
 * coalesce: only the last selection in the window resolves. The window is
 * intentionally small so a single selection reveals promptly while repeated
 * host edits still batch into one resolution.
 */
const DEBOUNCE_MS = 8;

function isBrowserCssInspection(
  value: BrowserCssInspection | TokenTable | undefined,
): value is BrowserCssInspection {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { inspect?: unknown; subscribe?: unknown };
  return typeof candidate.inspect === "function" && typeof candidate.subscribe === "function";
}

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
  inspectionOrLegacyTable?: BrowserCssInspection | TokenTable,
): ResolvedProperty[] {
  const [rows, setRows] = useState<ResolvedProperty[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revisionFrameRef = useRef<number | null>(null);
  const revisionSecondFrameRef = useRef<number | null>(null);
  const selectedDocument = selected?.domElement.ownerDocument ?? document;
  const session = isBrowserCssInspection(inspectionOrLegacyTable)
    ? inspectionOrLegacyTable
    : getBrowserCssInspection(selectedDocument);

  const latest = useRef({ selected, state, session });
  latest.current = { selected, state, session };

  function cancelScheduledResolution(): void {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (revisionFrameRef.current !== null) {
      cancelAnimationFrame(revisionFrameRef.current);
      revisionFrameRef.current = null;
    }
    if (revisionSecondFrameRef.current !== null) {
      cancelAnimationFrame(revisionSecondFrameRef.current);
      revisionSecondFrameRef.current = null;
    }
  }

  function resolve(): void {
    const current = latest.current;
    if (!current.selected) {
      setRows([]);
      return;
    }
    setRows([...current.session.inspect(current.selected.domElement, { state: current.state }).properties]);
  }

  function scheduleResolution(): void {
    cancelScheduledResolution();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      resolve();
    }, DEBOUNCE_MS);
  }

  function scheduleRevisionResolution(): void {
    cancelScheduledResolution();
    // Let the host commit paint first. The second frame refreshes the
    // attribution rows and available token snapshot without blocking the
    // edit's first frame on a full cascade walk.
    revisionFrameRef.current = requestAnimationFrame(() => {
      revisionFrameRef.current = null;
      revisionSecondFrameRef.current = requestAnimationFrame(() => {
        revisionSecondFrameRef.current = null;
        resolve();
      });
    });
  }

  useEffect(() => {
    scheduleResolution();
    return cancelScheduledResolution;
  }, [selected, state, session]);

  useEffect(() => session.subscribe(scheduleRevisionResolution), [session]);

  return rows;
}
