import { useEffect, useRef, useState } from "react";
import type { SelectedElement } from "../selectionStore.ts";
import type { InteractionState } from "../styleState.ts";
import type { ResolvedProperty } from "@design-tool/css/model";
import type {
  BrowserCssInspection,
  DocumentTokenInspectionSnapshot,
  InspectionSnapshot,
} from "./browserCssInspection.ts";
import { getBrowserCssInspection } from "./browserCssInspectionRegistry.ts";

const SELECTION_DEBOUNCE_MS = 8;

export interface BrowserCssInspectionView {
  element: InspectionSnapshot | null;
  stableProperties: readonly ResolvedProperty[];
  documentTokens: DocumentTokenInspectionSnapshot | null;
}

export interface BrowserCssInspectionViewOptions {
  includeDocumentTokens?: boolean;
  session?: BrowserCssInspection;
}

function inspectView(
  session: BrowserCssInspection,
  selected: SelectedElement | null,
  state: InteractionState,
  includeDocumentTokens: boolean,
): BrowserCssInspectionView {
  const element = selected
    ? session.inspect(selected.domElement, { state, cascade: "authored" })
    : null;
  const stableProperties = selected && state === "base"
    ? session.inspect(selected.domElement, { cascade: "stable" }).properties
    : [];
  return {
    element,
    stableProperties,
    documentTokens: includeDocumentTokens ? session.inspectTokens() : null,
  };
}

/**
 * React Adapter for one revision-aware browser inspection view. This is the
 * sole owner of subscription and scheduling policy; UI callers only project
 * the returned snapshots.
 */
export function useBrowserCssInspection(
  selected: SelectedElement | null,
  state: InteractionState = "base",
  options: BrowserCssInspectionViewOptions = {},
): BrowserCssInspectionView {
  const selectedDocument = selected?.domElement.ownerDocument ?? document;
  const session = options.session ?? getBrowserCssInspection(selectedDocument);
  const includeDocumentTokens = options.includeDocumentTokens ?? false;
  const latest = useRef({ selected, state, session, includeDocumentTokens });
  latest.current = { selected, state, session, includeDocumentTokens };
  const [view, setView] = useState<BrowserCssInspectionView>(() =>
    inspectView(session, selected, state, includeDocumentTokens));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revisionFrameRef = useRef<number | null>(null);
  const revisionSecondFrameRef = useRef<number | null>(null);

  const cancelScheduledInspection = (): void => {
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
  };

  const resolve = (): void => {
    const current = latest.current;
    setView(inspectView(
      current.session,
      current.selected,
      current.state,
      current.includeDocumentTokens,
    ));
  };

  const scheduleSelectionInspection = (): void => {
    cancelScheduledInspection();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      resolve();
    }, SELECTION_DEBOUNCE_MS);
  };

  const scheduleRevisionInspection = (): void => {
    cancelScheduledInspection();
    // Let the host commit and paint before refreshing the inspector projection.
    revisionFrameRef.current = requestAnimationFrame(() => {
      revisionFrameRef.current = null;
      revisionSecondFrameRef.current = requestAnimationFrame(() => {
        revisionSecondFrameRef.current = null;
        resolve();
      });
    });
  };

  useEffect(() => {
    scheduleSelectionInspection();
    return cancelScheduledInspection;
  }, [includeDocumentTokens, selected, state, session]);

  useEffect(() => session.subscribe(scheduleRevisionInspection), [session]);

  return view;
}
