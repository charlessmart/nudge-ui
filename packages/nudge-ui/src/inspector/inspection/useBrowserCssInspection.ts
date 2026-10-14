import { publishInspectionSnapshot } from "./inspectionSnapshot.ts";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SelectedElement } from "../selection/selectionStore.ts";
import type { InteractionState } from "../shell/styleState.ts";
import type { ResolvedProperty } from "../../css/model/index.ts";
import type {
  BrowserCssInspection,
  DocumentTokenInspectionSnapshot,
  InspectionSnapshot,
} from "./browserCssInspection.ts";
import { getBrowserCssInspection } from "./browserCssInspectionRegistry.ts";
import { countInspectionWork } from "./performanceDiagnostics.ts";

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

interface ScopedInspectionView extends BrowserCssInspectionView {
  selection: readonly SelectedElement[];
  state: InteractionState;
  session: BrowserCssInspection;
}

const EMPTY_VIEW: BrowserCssInspectionView = {
  element: null,
  elements: [],
  stableProperties: [],
  documentTokens: null,
};

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

function inspectView(
  session: BrowserCssInspection,
  selected: readonly SelectedElement[],
  state: InteractionState,
  includeDocumentTokens: boolean,
): ScopedInspectionView {
  const result = session.refresh?.(selected.map((element) => element.domElement), state);
  const elements = result?.elements ?? selected.map((element) =>
    session.inspect(element.domElement, { state, cascade: "authored" }));
  const stableProperties = result?.stableProperties ?? (selected[0] && state === "base"
    ? session.inspect(selected[0].domElement, { cascade: "stable" }).properties : []);
  elements.forEach((snapshot, index) => publishInspectionSnapshot(selected[index]!.domElement, snapshot));
  return {
    selection: selected, state, session,
    element: elements[0] ?? null, elements, stableProperties,
    documentTokens: includeDocumentTokens ? session.inspectTokens() : null,
  };
}

/** Sole owner of subscription and scheduling policy; callers only project the returned snapshots. */
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
  const [view, setView] = useState<ScopedInspectionView>(() => ({
    ...EMPTY_VIEW, selection: EMPTY_SELECTION, state, session,
  }));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSelectionResolveAtRef = useRef(0);
  const revisionFrameRef = useRef<number | null>(null);
  const revisionSecondFrameRef = useRef<number | null>(null);
  const revisionThirdFrameRef = useRef<number | null>(null);
  const revisionWarmFrameRef = useRef<number | null>(null);

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
  };

  const resolveSync = (): void => {
    const current = latest.current;
    countInspectionWork(selectedDocument, "refreshes");
    lastSelectionResolveAtRef.current = performance.now();
    setView(inspectView(
      current.session,
      current.selected,
      current.state,
      current.includeDocumentTokens,
    ));
  };

  const scheduleSelectionInspection = (): void => {
    cancelScheduledInspection();
    // Leading-edge resolve: a selection change resolves immediately, and rapid re-selections coalesce onto one trailing resolve.
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
    // Let the host commit and paint: the extra frames let a new revision cancel the pending refresh and give the stylesheet walk its own frame.
    revisionFrameRef.current = requestAnimationFrame(() => {
      revisionFrameRef.current = null;
      revisionSecondFrameRef.current = requestAnimationFrame(() => {
        revisionSecondFrameRef.current = null;
        revisionThirdFrameRef.current = requestAnimationFrame(() => {
          revisionThirdFrameRef.current = null;
          latest.current.session.prewarmRules?.();
          revisionWarmFrameRef.current = requestAnimationFrame(() => {
            revisionWarmFrameRef.current = null;
            resolveSync();
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

  // Warm during idle so the first selection does not pay the stylesheet walk; the walk is idempotent per stylesheet revision.
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

  // Selection effects run after children render; never expose the previous element's rows while inspection is pending.
  const matchesSelection = view.session === session && view.state === state
    && view.selection.length === selectedElements.length
    && view.selection.every((element, index) => element.domElement === selectedElements[index]?.domElement);
  return matchesSelection ? view : EMPTY_VIEW;
}
