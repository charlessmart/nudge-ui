import { InspectorPanel } from "./InspectorPanel.tsx";
import { InspectorSelection } from "./InspectorSelection.tsx";
import { describeElement } from "./elementName.ts";
import { InspectorEditors } from "./InspectorEditors.tsx";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { useInspectorOpen, setInspectorOpen } from "./openStore.ts";
import {
  useSelectedElement,
  useSelectedElements,
  setSelectedElement,
  removeSelectedElement,
} from "../selection/selectionStore.ts";
import type { ResolvedProperty } from "../../css/model/index.ts";
import { findTokenRow } from "../styleEditors/rowLookup.ts";
import type { TokenEntry } from "../../css/model/index.ts";

declare global {
  interface Window {
    MutationObserver: typeof MutationObserver;
  }
}

import { useBrowserCssInspection } from "../inspection/useBrowserCssInspection.ts";
import { resolveSelectionFromElement } from "../selection/resolveSelection.ts";
import { isPageTarget } from "../selection/pageTarget.ts";
import { AgentStatusButton } from "./AgentStatusButton.tsx";
import { isTextRelevant } from "../styleEditors/textRelevance.ts";
import { ChangesLog } from "./ChangesLog.tsx";
import { discardChangesForInstanceOverride, undo, redo } from "../drafts/store.ts";
import { countSourceSiteMatches, getEditScope, relinkElement, sourceSiteSelector, unlinkElement } from "../selection/editScope.ts";
import { canEditStyles } from "../tokens/editActions.ts";
import { CopyPromptButton } from "./CopyPromptButton.tsx";
import { PeekOriginalButton } from "./PeekOriginalButton.tsx";
import { NudgeLogoIcon } from "./NudgeLogoIcon.tsx";
import type { SettingsSection } from "../settings/SettingsDialog.tsx";
import { StatusCallout } from "../ui/StatusCallout.tsx";
import { UI_STYLES } from "../ui/styles.ts";
import { getActiveStyleState, setActiveStyleState } from "./styleState.ts";
import { useInteractionStatePreview } from "./interactionStatePreview.ts";
import type { InteractionState } from "./styleState.ts";
import { getInspectorToggleShortcutLabel, isEditableEvent } from "./shortcuts.ts";
import { clearSelectedFrameChanges } from "../canvas/sessionStore.ts";
import {
  useFocusedCardId,
  useSelectedCardId,
} from "../canvas/canvasStore.ts";
import { getActiveCanvasFrame } from "../canvas/activeCanvasDocument.ts";
import { canvasFrameHost } from "../canvas/canvasFrame.ts";
import { getFrameRegistryVersion, subscribeFrameRegistry } from "../canvas/projection.ts";
import { getElementWindow } from "../runtime/domRealm.ts";
import { deleteElement, nudgeElement } from "../overlay/structuralGestures.ts";
import { ComponentPropsSection, useComponentProps } from "../componentSemantics/ComponentPropsSection.tsx";
import {
  cancelInlineTextEdit,
  isInlineTextEditingActive,
  useInlineTextDiagnostic,
} from "../inline-text/inlineTextEditor.ts";
import { getInlineTextFeedback } from "../inline-text/inlineTextFeedback.ts";
import { useNudgeUiRuntimeConfig } from "../runtime/useRuntimeConfig.ts";
import { EmptyState } from "./EmptyState.tsx";
import { createStyleSelection } from "../selection/styleSelection.ts";
import { intersectTokenEntries } from "../inspection/selectionProperty.ts";
import { isNudgeUiDev } from "../runtime/devFlag.ts";
import { isDemoRuntime, isNudgeUiFeatureEnabled } from "../runtime/runtimeConfig.ts";
import { SketchWorkspace } from "../sketch/SketchWorkspace.tsx";
import { useSketchInteractionActive } from "../sketch/interaction.ts";
import { InspectorStyle } from "../ui/InspectorStyle.tsx";

function findFirstTokenRow(rows: ResolvedProperty[], properties: string[]): ResolvedProperty | null {
  for (const property of properties) {
    const row = findTokenRow(rows, property);
    if (row?.tokenName) return row;
  }
  for (const property of properties) {
    const row = findTokenRow(rows, property);
    if (row) return row;
  }
  return null;
}

function nodeMatchesSelector(node: Node, selector: string | null): boolean {
  if (!selector || node.nodeType !== node.ELEMENT_NODE) return false;
  // SAFETY: node.nodeType was checked as ELEMENT_NODE above, so it is an Element.
  const element = node as Element;
  try {
    return element.matches(selector) || element.querySelector(selector) !== null;
  } catch {
    return false;
  }
}

function scopeMutationAffectsSelection(records: MutationRecord[], selected: HTMLElement): boolean {
  const selector = sourceSiteSelector(
    selected.getAttribute("data-cid") ?? "",
    selected.getAttribute("data-src") ?? "",
  );
  return records.some((record) => {
    if (record.type === "attributes") {
      return record.target === selected || record.attributeName !== "data-projection-instance";
    }
    return [...record.addedNodes, ...record.removedNodes]
      .some((node) => nodeMatchesSelector(node, selector));
  });
}

export function InspectorShell(): ReactElement {
  const isOpen = useInspectorOpen();
  const runtimeConfig = useNudgeUiRuntimeConfig();
  const sketchEnabled = isNudgeUiDev()
    && !runtimeConfig.inspectionUnavailableReason
    && (!isDemoRuntime() || isNudgeUiFeatureEnabled(runtimeConfig.features, "sketch"));
  const sketchActive = useSketchInteractionActive();
  const selectedCardId = useSelectedCardId();
  const focusedCardId = useFocusedCardId();
  useSyncExternalStore(subscribeFrameRegistry, getFrameRegistryVersion);
  const sketchHost = selectedCardId || focusedCardId ? canvasFrameHost(getActiveCanvasFrame()) : null;
  const selected = useSelectedElement();
  const selectedElements = useSelectedElements();
  const componentProps = useComponentProps(selected);
  const inlineTextFeedback = getInlineTextFeedback(useInlineTextDiagnostic());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("instructions");
  const [scopeRevision, refreshScope] = useState(0);
  const [styleState, setStyleState] = useState<InteractionState>(getActiveStyleState());
  useInteractionStatePreview(selectedElements.length === 1 ? selectedElements[0]!.domElement : null, styleState);
  const cssInspection = useBrowserCssInspection(selectedElements, styleState);
  const isMultiSelection = selectedElements.length > 1;  useEffect(() => {
    // A new selection must not inherit an incidental state from the previous element; base is the deliberate default.
    setActiveStyleState("base");
    setStyleState("base");
  }, [selected?.domElement, isMultiSelection]);

  useEffect(() => {
    if (!selected) return;
    // In canvas mode the element can live in a card iframe, so observe its ownerDocument, not the parent app's.
    const observers: MutationObserver[] = [];
    const roots = new Map<Document, HTMLElement>();
    for (const target of selectedElements) {
      const ownerRoot = target.domElement.ownerDocument?.documentElement;
      if (ownerRoot) roots.set(target.domElement.ownerDocument, ownerRoot);
    }
    for (const [ownerDocument, ownerRoot] of roots) {
      const OwnerMutationObserver = getElementWindow(ownerRoot).MutationObserver;
      const observer = new OwnerMutationObserver((records) => {
        if (selectedElements.some((candidate) => scopeMutationAffectsSelection(records, candidate.domElement))) {
          refreshScope((revision) => revision + 1);
        }
        for (const candidate of selectedElements) {
          if (candidate.domElement.ownerDocument === ownerDocument && !candidate.domElement.isConnected) {
            removeSelectedElement(candidate.domElement);
          }
        }
      });
      observer.observe(ownerRoot, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-cid", "data-src", "data-projection-instance"],
      });
      observers.push(observer);
    }
    return () => observers.forEach((observer) => observer.disconnect());
  }, [selectedElements, scopeRevision]);

  useEffect(() => {
    if (sketchActive || runtimeConfig.inspectionUnavailableReason) return;
    function onKeydown(event: KeyboardEvent): void {
      if (isInlineTextEditingActive()) return;
      const mod = event.metaKey || event.ctrlKey;
      const editable = isEditableEvent(event);

      if (!editable) {
        const scrollKey = event.code === "Space"
          || event.key === "ArrowUp"
          || event.key === "ArrowDown"
          || event.key === "ArrowLeft"
          || event.key === "ArrowRight";
        if (scrollKey) event.preventDefault();
        if (mod && event.shiftKey && event.key.toLowerCase() === "z") {
          event.preventDefault();
          redo();
          return;
        }
        if (mod && !event.shiftKey && event.key.toLowerCase() === "z") {
          event.preventDefault();
          undo();
          return;
        }
      }

      if (!selected || editable) return;
      if (event.key === "Escape" || event.key === "Esc") {
        event.preventDefault();
        setSelectedElement(null);
        return;
      }
      // macOS labels the physical Backspace key as Delete; browsers report "Backspace". Support both.
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (!isMultiSelection && deleteElement(selected)) setSelectedElement(null);
        return;
      }
      if (isMultiSelection) return;
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (nudgeElement(selected.domElement, event.key)) {
        const refreshed = resolveSelectionFromElement(selected.domElement);
        if (refreshed) setSelectedElement(refreshed);
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [isMultiSelection, selected, sketchActive, runtimeConfig.inspectionUnavailableReason]);

  const inspectionSnapshot = cssInspection.element;
  const styleSelection = useMemo(
    () => createStyleSelection(selectedElements, cssInspection.elements, selected),
    [cssInspection.elements, selected, selectedElements],
  );
  const selectionEditable = useMemo(
    () => styleSelection ? canEditStyles(styleSelection.target) : false,
    [scopeRevision, styleSelection],
  );
  const tokenEntries: TokenEntry[] = useMemo(
    () => intersectTokenEntries(cssInspection.elements.map((snapshot) => snapshot.availableTokens)),
    [cssInspection.elements],
  );
  const tokenRows: ResolvedProperty[] = useMemo(
    () => styleSelection ? [...styleSelection.primaryRows] : [],
    [styleSelection],
  );
  const availableInteractionStates = inspectionSnapshot?.availableStates ?? [];
  const showText = selectedElements.length > 0 && selectedElements.every((element, index) =>
    isTextRelevant(element.domElement, cssInspection.elements[index]?.properties ?? []));
  const paintedBackgroundRow = findFirstTokenRow(tokenRows, ["background-color", "background"]);
  const backgroundTokenRow = useMemo(() => {
    if (!selected) return null;
    if (isMultiSelection) return paintedBackgroundRow;
    if (paintedBackgroundRow?.tokenName || styleState !== "base") return paintedBackgroundRow;
    return cssInspection.stableProperties.find((row) =>
      (row.property === "background-color" || row.property === "background") && row.tokenName,
    ) ?? paintedBackgroundRow;
  }, [cssInspection.stableProperties, isMultiSelection, paintedBackgroundRow, selected, styleState]);
  const editScope = selected && !isMultiSelection ? getEditScope(selected.domElement) : null;
  const sourceSiteMatchCount = selected && editScope === "source-site"
    ? countSourceSiteMatches(selected.domElement, scopeRevision)
    : 0;
  function refreshScopeState(): void {
    refreshScope((revision) => revision + 1);
  }

  function openSettings(section: SettingsSection): void {
    setSettingsSection(section);
    setSettingsOpen(true);
  }

  function clearInspectorSession(): void {
    // Sketch persistence failures are reported by the sketch store in the panel.
    void clearSelectedFrameChanges().catch(() => undefined);
  }

  return (
    <>
      <InspectorStyle testId="inspector-styles" css={UI_STYLES} />
      <InspectorPanel
        isOpen={isOpen}
        collapseDisabled={sketchActive}
        toggleShortcut={getInspectorToggleShortcutLabel()}
        onOpenChange={(open) => {
          if (!open) cancelInlineTextEdit();
          setInspectorOpen(open);
        }}
        headerActions={<><PeekOriginalButton /><AgentStatusButton onOpenSettings={openSettings} /></>}
        prompt={<CopyPromptButton
          settingsOpen={settingsOpen}
          settingsSection={settingsSection}
          onOpenSettings={openSettings}
          onSettingsOpenChange={setSettingsOpen}
          onClearChanges={clearInspectorSession}
        />}
      >
        {inlineTextFeedback ? (
          <StatusCallout
            tone="danger"
            className="inline-text-diagnostic"
            data-test="inline-text-diagnostic"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <span>{inlineTextFeedback.message}</span>
          </StatusCallout>
        ) : null}
        {runtimeConfig.inspectionUnavailableReason ? (
          <StatusCallout tone="danger" data-test="page-inspection-error" role="status">
            Can’t load Nudge on this page due to {runtimeConfig.inspectionUnavailableReason}.
          </StatusCallout>
        ) : selected ? (
          <>
            <InspectorSelection
              identity={selected}
              count={selectedElements.length}
              isComponent={!isMultiSelection && componentProps !== null}
              name={isMultiSelection ? { title: `${selectedElements.length} elements` } : componentProps ? { title: componentProps.target.meta.componentName } : describeElement(selected.domElement)}
              editScope={editScope}
              sourceSiteMatchCount={sourceSiteMatchCount}
              styleState={styleState}
              availableInteractionStates={availableInteractionStates}
              onStyleStateChange={(state) => {
                setActiveStyleState(state);
                setStyleState(state);
              }}
              onRelink={() => {
                const overrideId = relinkElement(selected.domElement);
                if (overrideId) discardChangesForInstanceOverride(overrideId);
                refreshScopeState();
              }}
              onUnlink={() => {
                unlinkElement(selected.domElement);
                refreshScopeState();
              }}
            >
              {!isMultiSelection ? <ComponentPropsSection selected={selected} /> : null}
            </InspectorSelection>

            {selectionEditable ? (
              <InspectorEditors
                selected={selected}
                styleSelection={styleSelection}
                tokenEntries={tokenEntries}
                tokenRows={tokenRows}
                styleState={styleState}
                showText={showText}
                pageTarget={!isMultiSelection && isPageTarget(selected.domElement)}
                backgroundTokenRow={backgroundTokenRow}
              />
            ) : (
              <StatusCallout tone="neutral" data-test="multi-selection-uneditable">
                These repeated items are indistinguishable, so Nudge UI cannot safely target only part of the group. Select every repeated item to edit them together.
              </StatusCallout>
            )}
          </>
        ) : (
          <EmptyState />
        )}
        <ChangesLog
          onClearSession={clearInspectorSession}
        />
      </InspectorPanel>
      {sketchEnabled ? (
        <SketchWorkspace hostElement={sketchHost} projectId={runtimeConfig.projectId} />
      ) : null}
    </>
  );
}
