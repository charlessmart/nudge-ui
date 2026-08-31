import { useEffect, useRef, useState } from "react";
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

export interface BrowserCssInspectionView {
  element: InspectionSnapshot | null;
  stableProperties: readonly ResolvedProperty[];
  documentTokens: DocumentTokenInspectionSnapshot | null;
}

export interface BrowserCssInspectionViewOptions {
  includeDocumentTokens?: boolean;
  session?: BrowserCssInspection;
}

function inspectAuthoredElement(
  session: BrowserCssInspection,
  selected: SelectedElement | null,
  state: InteractionState,
): InspectionSnapshot | null {
  return selected
    ? session.inspect(selected.domElement, { state, cascade: "authored" })
    : null;
}

function inspectStableView(
  session: BrowserCssInspection,
  selected: SelectedElement | null,
  state: InteractionState,
  includeDocumentTokens: boolean,
  element: InspectionSnapshot | null,
): BrowserCssInspectionView {
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
    inspectStableView(session, selected, state, includeDocumentTokens, inspectAuthoredElement(session, selected, state)));
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
      inspectAuthoredElement(current.session, current.selected, current.state),
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
    const element = inspectAuthoredElement(current.session, current.selected, current.state);
    stableFrameRef.current = requestAnimationFrame(() => {
      stableFrameRef.current = null;
      setView(inspectStableView(
        current.session,
        current.selected,
        current.state,
        current.includeDocumentTokens,
        element,
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
  }, [includeDocumentTokens, selected, state, session]);

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
