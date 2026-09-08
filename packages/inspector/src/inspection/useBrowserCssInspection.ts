import { useEffect, useMemo, useRef, useState } from "react";
import type { SelectedElement } from "../selectionStore.ts";
import type { InteractionState } from "../styleState.ts";
import type { ResolvedProperty } from "@nudge-ui/css/model";
import type {
  BrowserCssInspection,
  DocumentTokenInspectionSnapshot,
  InspectionSnapshot,
} from "./browserCssInspection.ts";
import { getBrowserCssInspection } from "./browserCssInspectionRegistry.ts";

const SELECTION_DEBOUNCE_MS = 8;
const EMPTY_SELECTION: readonly SelectedElement[] = [];

function isSelectedElementList(
  selected: SelectedElement | readonly SelectedElement[],
): selected is readonly SelectedElement[] {
  return Array.isArray(selected);
}

export interface BrowserCssInspectionView {
  element: InspectionSnapshot | null;
  elements: readonly InspectionSnapshot[];
  stableProperties: readonly ResolvedProperty[];
  documentTokens: DocumentTokenInspectionSnapshot | null;
}

export interface BrowserCssInspectionViewOptions {
  includeDocumentTokens?: boolean;
  session?: BrowserCssInspection;
}

function normalizeSelection(
  selected: SelectedElement | readonly SelectedElement[] | null,
): readonly SelectedElement[] {
  if (!selected) return EMPTY_SELECTION;
  if (isSelectedElementList(selected)) return selected;
  return [selected];
}

function inspectAuthoredElements(
  session: BrowserCssInspection,
  selected: readonly SelectedElement[],
  state: InteractionState,
): readonly InspectionSnapshot[] {
  return selected.map((element) => session.inspect(element.domElement, { state, cascade: "authored" }));
}

function inspectStableView(
  session: BrowserCssInspection,
  selected: readonly SelectedElement[],
  state: InteractionState,
  includeDocumentTokens: boolean,
  elements: readonly InspectionSnapshot[],
): BrowserCssInspectionView {
  const primary = elements[0] ?? null;
  const stableProperties = selected[0] && state === "base"
    ? session.inspect(selected[0].domElement, { cascade: "stable" }).properties
    : [];
  const documentTokens = includeDocumentTokens ? session.inspectTokens() : null;
  return {
    element: primary,
    elements,
    stableProperties,
    documentTokens,
  };
}

/**
 * React Adapter for one revision-aware browser inspection view. This is the
 * sole owner of subscription and scheduling policy; UI callers only project
 * the returned snapshots.
 */
export function useBrowserCssInspection(
  selected: SelectedElement | readonly SelectedElement[] | null,
  state: InteractionState = "base",
  options: BrowserCssInspectionViewOptions = {},
): BrowserCssInspectionView {
  const selectedElements = useMemo(() => normalizeSelection(selected), [selected]);
  const selectedDocument = selectedElements[0]?.domElement.ownerDocument ?? document;
  const session = options.session ?? getBrowserCssInspection(selectedDocument);
  const includeDocumentTokens = options.includeDocumentTokens ?? false;
  const latest = useRef({ selected: selectedElements, state, session, includeDocumentTokens });
  latest.current = { selected: selectedElements, state, session, includeDocumentTokens };
  const [view, setView] = useState<BrowserCssInspectionView>(() =>
    inspectStableView(
      session,
      selectedElements,
      state,
      includeDocumentTokens,
      inspectAuthoredElements(session, selectedElements, state),
    ));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSelectionResolveAtRef = useRef(0);
  const revisionFrameRef = useRef<number | null>(null);
  const revisionSecondFrameRef = useRef<number | null>(null);
  const revisionThirdFrameRef = useRef<number | null>(null);
  const revisionWarmFrameRef = useRef<number | null>(null);
  const stableFrameRef = useRef<number | null>(null);

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
    if (revisionThirdFrameRef.current !== null) {
      cancelAnimationFrame(revisionThirdFrameRef.current);
      revisionThirdFrameRef.current = null;
    }
    if (revisionWarmFrameRef.current !== null) {
      cancelAnimationFrame(revisionWarmFrameRef.current);
      revisionWarmFrameRef.current = null;
    }
    if (stableFrameRef.current !== null) {
      cancelAnimationFrame(stableFrameRef.current);
      stableFrameRef.current = null;
    }
  };

  const resolveSync = (): void => {
    const current = latest.current;
    lastSelectionResolveAtRef.current = performance.now();
    setView(inspectStableView(
      current.session,
      current.selected,
      current.state,
      current.includeDocumentTokens,
      inspectAuthoredElements(current.session, current.selected, current.state),
    ));
  };

  const resolveSplit = (): void => {
    const current = latest.current;
    // Post-commit refresh: the authored cascade resolves in this task and the
    // secondary stable cascade continues one frame later. Rapid successive
    // edits therefore cancel the pending refresh (revision bumps reschedule)
    // instead of finding a long blocking task already running, and the two
    // resolution sweeps never block one task for their combined duration.
    // The view still commits once, with the same data and ordering.
    const elements = inspectAuthoredElements(current.session, current.selected, current.state);
    stableFrameRef.current = requestAnimationFrame(() => {
      stableFrameRef.current = null;
      setView(inspectStableView(
        current.session,
        current.selected,
        current.state,
        current.includeDocumentTokens,
        elements,
      ));
    });
  };

  const scheduleSelectionInspection = (): void => {
    cancelScheduledInspection();
    // Leading-edge resolve: a selection change resolves immediately instead
    // of always waiting out the debounce. Rapid re-selections inside the
    // trailing window still coalesce onto one trailing resolve, so the final
    // view is identical and repeated selections cannot stack full sweeps.
    const sinceLast = performance.now() - lastSelectionResolveAtRef.current;
    if (sinceLast >= SELECTION_DEBOUNCE_MS) {
      resolveSync();
      return;
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      resolveSync();
    }, SELECTION_DEBOUNCE_MS - sinceLast);
  };

  const scheduleRevisionInspection = (): void => {
    cancelScheduledInspection();
    // Let the host commit and paint before refreshing the inspector
    // projection. The extra frames keep the refresh start past the gap
    // between rapid successive edits, so a new revision cancels the pending
    // refresh instead of colliding with a running one, and they give the
    // stylesheet walk its own frame so no single refresh task blocks for the
    // combined duration of the walk plus a cascade sweep.
    revisionFrameRef.current = requestAnimationFrame(() => {
      revisionFrameRef.current = null;
      revisionSecondFrameRef.current = requestAnimationFrame(() => {
        revisionSecondFrameRef.current = null;
        revisionThirdFrameRef.current = requestAnimationFrame(() => {
          revisionThirdFrameRef.current = null;
          latest.current.session.prewarmRules?.();
          revisionWarmFrameRef.current = requestAnimationFrame(() => {
            revisionWarmFrameRef.current = null;
            resolveSplit();
          });
        });
      });
    });
  };

  useEffect(() => {
    scheduleSelectionInspection();
    return cancelScheduledInspection;
  }, [includeDocumentTokens, selectedElements, state, session]);

  useEffect(() => session.subscribe(scheduleRevisionInspection), [session]);

  // Warm the CSSOM rule snapshot during idle time so the first selection does
  // not pay the stylesheet walk inside its own interaction. The idle timeout
  // bounds the wait without competing with page-load paint; the walk is
  // idempotent per stylesheet revision, so this is a no-op once warm.
  const prewarmedSessionRef = useRef<BrowserCssInspection | null>(null);
  useEffect(() => {
    if (prewarmedSessionRef.current === session) return;
    prewarmedSessionRef.current = session;
    const ownerWindow = selectedDocument.defaultView;
    const warm = (): void => session.prewarmRules?.();
    if (ownerWindow && typeof ownerWindow.requestIdleCallback === "function") {
      const idleId = ownerWindow.requestIdleCallback(() => warm(), { timeout: 2000 });
      return () => ownerWindow.cancelIdleCallback(idleId);
    }
    const timeoutId = setTimeout(warm, 200);
    return () => clearTimeout(timeoutId);
  }, [session, selectedDocument]);

  return view;
}
