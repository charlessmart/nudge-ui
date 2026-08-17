import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { IconArtboard, IconColorSwatch, IconLayoutSidebarRightCollapse, IconLayoutSidebarRightExpand } from "@tabler/icons-react";
import { useInspectorOpen, toggleInspector, setInspectorOpen } from "./openStore.ts";
import {
  useSelectedElement,
  setSelectedElement,
} from "./selectionStore.ts";
import type { SelectedElement } from "./selectionStore.ts";
import { InspectorOverlay } from "./InspectorOverlay.tsx";
import type { ResolvedProperty } from "@design-tool/css/model";
import type { TokenEntry } from "virtual:design-tokens";

declare global {
  interface Window {
    MutationObserver: typeof MutationObserver;
  }
}

import { useBrowserCssInspection } from "./inspection/useBrowserCssInspection.ts";
import { resolveSelectionFromElement } from "./resolveSelection.ts";
import { SpacingBox } from "./styleEditors/SpacingBox.tsx";
import { Typography } from "./styleEditors/Typography.tsx";
import { ColorPicker } from "./styleEditors/ColorPicker.tsx";
import { BorderEditor } from "./styleEditors/BorderEditor.tsx";
import { AppearanceSection } from "./styleEditors/AppearanceSection.tsx";
import { BoxShadowEditor } from "./styleEditors/BoxShadowEditor.tsx";
import { LayoutSection } from "./styleEditors/LayoutSection.tsx";
import { ChangesLog } from "./ChangesLog.tsx";
import { discardChangesForInstanceOverride, undo, redo } from "./changesLog.ts";
import { countSourceSiteMatches, getEditScope, relinkElement, sourceSiteSelector, unlinkElement } from "./editScope.ts";
import { Button } from "./ui/Button.tsx";
import { CopyPromptButton } from "./CopyPromptButton.tsx";
import { StatusCallout } from "./ui/StatusCallout.tsx";
import { IconButton } from "./ui/IconButton.tsx";
import { UI_STYLES } from "./ui/styles.ts";
import { TokensPanel } from "./tokens/TokensPanel.tsx";
import { getActiveStyleState, setActiveStyleState } from "./styleState.ts";
import type { InteractionState } from "./styleState.ts";
import { isEditableEvent } from "./shortcuts.ts";
import { clearInspectorLayout, setInspectorLayoutOpen } from "./panelLayout.ts";
import { formatInspectorLabel } from "./ui/labels.ts";
import { enterCanvas, exitCanvas, exitCanvasToCard, getCanvasCards, getSelectedCardId, useCanvasMode } from "./canvas/canvasStore.ts";
import { getRestoreCount, clearRestoreCount, clearSession } from "./canvas/sessionStore.ts";
import { getElementWindow } from "./domRealm.ts";
import { deleteElement, nudgeElement } from "./structuralGestures.ts";
import { redoStructuralChange, undoStructuralChange } from "./structuralProjection.ts";
import { AtRuleContextProvider } from "./ui/AtRuleContext.tsx";
import { ComponentPropsSection } from "./componentSemantics/ComponentPropsSection.tsx";

function findTokenRow(rows: ResolvedProperty[], prop: string): ResolvedProperty | null {
  return rows.find((row) => row.property === prop) ?? null;
}

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

export { toggleInspector, setInspectorOpen };
export type { SelectedElement } from "./selectionStore.ts";

let inspectorHost: HTMLElement | null = null;

export function setInspectorHost(host: HTMLElement | null): void {
  inspectorHost = host;
}

function resolveHost(): HTMLElement {
  return inspectorHost ?? document.getElementById("design-tool-root") ?? document.body;
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
      return record.target === selected || record.attributeName !== "data-dt-projection-instance";
    }
    return [...record.addedNodes, ...record.removedNodes]
      .some((node) => nodeMatchesSelector(node, selector));
  });
}

export function InspectorShell(): ReactElement {
  const isOpen = useInspectorOpen();
  const canvasMode = useCanvasMode();
  const selected = useSelectedElement();
  const [scopeRevision, refreshScope] = useState(0);
  const [activeTab, setActiveTab] = useState<"inspect" | "tokens">("inspect");
  const [styleState, setStyleState] = useState<InteractionState>(getActiveStyleState());
  const [restoreCount, setShowRestore] = useState<number>(getRestoreCount());
  const cssInspection = useBrowserCssInspection(selected, styleState, {
    includeDocumentTokens: activeTab === "tokens",
  });

  useEffect(() => {
    setInspectorLayoutOpen(isOpen);
    return clearInspectorLayout;
  }, [isOpen]);

  useEffect(() => {
    // A new selection should never inherit an incidental state from the
    // previous element. Base is the inspector's deliberate default.
    setActiveStyleState("base");
    setStyleState("base");
  }, [selected?.domElement]);

  useEffect(() => {
    if (!selected) return;
    // The selected element can live inside a card iframe (canvas mode); observe
    // its own ownerDocument rather than the parent app's document, otherwise
    // removal inside the iframe would never be noticed.
    const ownerRoot = selected.domElement.ownerDocument?.documentElement ?? document.documentElement;
    const OwnerMutationObserver = getElementWindow(selected.domElement).MutationObserver;
    const observer = new OwnerMutationObserver((records) => {
      if (scopeMutationAffectsSelection(records, selected.domElement)) {
        refreshScope((revision) => revision + 1);
      }
      if (!selected.domElement.isConnected) setSelectedElement(null);
    });
    observer.observe(ownerRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-cid", "data-src", "data-dt-projection-instance"],
    });
    return () => observer.disconnect();
  }, [selected, scopeRevision]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeydown(event: KeyboardEvent): void {
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
          if (!redoStructuralChange()) redo();
          return;
        }
        if (mod && !event.shiftKey && event.key.toLowerCase() === "z") {
          event.preventDefault();
          if (!undoStructuralChange()) undo();
          return;
        }
      }

      if (!selected || editable) return;
      // macOS labels the physical Backspace key as Delete, while browsers
      // report it as "Backspace". Support both without stealing text edits.
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (deleteElement(selected)) setSelectedElement(null);
        return;
      }
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (nudgeElement(selected.domElement, event.key)) {
        const refreshed = resolveSelectionFromElement(selected.domElement);
        if (refreshed) setSelectedElement(refreshed);
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [isOpen, selected]);

  const inspectionSnapshot = cssInspection.element;
  const tokenEntries: TokenEntry[] = useMemo(
    () => inspectionSnapshot ? [...inspectionSnapshot.availableTokens] : [],
    [inspectionSnapshot],
  );
  const tokenRows: ResolvedProperty[] = useMemo(
    () => inspectionSnapshot ? [...inspectionSnapshot.properties] : [],
    [inspectionSnapshot],
  );
  const availableInteractionStates = inspectionSnapshot?.availableStates ?? [];
  const showInteractionState = availableInteractionStates.length > 2;
  const paintedBackgroundRow = findFirstTokenRow(tokenRows, ["background-color", "background"]);
  const backgroundTokenRow = useMemo(() => {
    if (!selected) return null;
    if (paintedBackgroundRow?.tokenName || styleState !== "base") return paintedBackgroundRow;
    return cssInspection.stableProperties.find((row) =>
      (row.property === "background-color" || row.property === "background") && row.tokenName,
    ) ?? paintedBackgroundRow;
  }, [cssInspection.stableProperties, paintedBackgroundRow, selected, styleState]);
  const editScope = selected ? getEditScope(selected.domElement) : null;
  const sourceSiteMatchCount = selected && editScope === "source-site"
    ? countSourceSiteMatches(selected.domElement, scopeRevision)
    : 0;
  function refreshSelected(): void {
    if (!selected) return;
    const reResolved = resolveSelectionFromElement(selected.domElement);
    if (reResolved) setSelectedElement(reResolved);
  }

  function refreshScopeState(): void {
    refreshScope((revision) => revision + 1);
  }

  function handleCanvasModeButton(): void {
    if (canvasMode !== "canvas") {
      enterCanvas();
      return;
    }

    const selectedCardId = getSelectedCardId();
    const selectedCard = selectedCardId
      ? getCanvasCards().find((card) => card.id === selectedCardId)
      : undefined;
    if (selectedCard) {
      exitCanvasToCard(selectedCard);
    } else {
      exitCanvas();
    }
  }

  return (
    <>
      <style data-test="inspector-styles">{UI_STYLES}</style>
      {canvasMode === "inspect" && <InspectorOverlay host={resolveHost()} />}
      <div className="dt-panel" data-open={isOpen ? "true" : "false"}>
        <div className="dt-panel__tabs" aria-label="Inspector controls">
          <div
            className="dt-panel__header-row"
            data-test="inspect-tab"
          >
            <IconButton
              variant="quiet"
              label="Collapse inspector"
              data-test="collapse-inspector"
              onClick={() => setInspectorOpen(false)}
            >
              <IconLayoutSidebarRightCollapse size="var(--dt-icon-size-small)" stroke={1.8} aria-hidden="true" />
            </IconButton>
            <div className="dt-panel__header-actions">
              <IconButton
                variant={activeTab === "tokens" ? "secondary" : "quiet"}
                className={`dt-panel__icon-tab dt-button--${activeTab === "tokens" ? "secondary" : "quiet"}`}
                role="tab"
                aria-selected={activeTab === "tokens"}
                data-active={activeTab === "tokens" ? "true" : "false"}
                data-test="tokens-tab"
                label="Tokens"
                title="Tokens"
                onClick={() => setActiveTab(activeTab === "tokens" ? "inspect" : "tokens")}
              >
                <IconColorSwatch size="var(--dt-icon-size-small)" stroke={1.8} aria-hidden="true" />
              </IconButton>
              <span className="dt-panel__header-divider" aria-hidden="true" />
              <Button
                variant="quiet"
                className="dt-panel__canvas-button"
                data-test="mode-canvas"
                data-active={canvasMode === "canvas" ? "true" : "false"}
                aria-pressed={canvasMode === "canvas"}
                type="button"
                onClick={handleCanvasModeButton}
              >
                <IconArtboard size="var(--dt-icon-size-small)" stroke={1.8} aria-hidden="true" />
                {canvasMode === "canvas" ? "Exit canvas" : "View canvas"}
              </Button>
            </div>
          </div>
          <div className="dt-panel__copy-row">
            <CopyPromptButton />
          </div>
        </div>
        <div className="dt-panel__body">
          {activeTab === "tokens" ? (
            <TokensPanel rows={cssInspection.documentTokens?.tokens ?? []} />
          ) : selected ? (
            <>
              <div
                className="dt-selection"
                data-test="selection"
                data-selected-cid={selected.cid}
                data-selected-src={selected.src}
              >
                {showInteractionState ? (
                  <div className="dt-style-state" data-test="style-state">
                    <span className="dt-selection__label">State</span>
                    <div className="dt-style-state__options" role="group" aria-label="Style State">
                      {availableInteractionStates.map((state) => (
                        <Button
                          key={state}
                          size="compact"
                          variant={styleState === state ? "primary" : "quiet"}
                          className="dt-style-state__option"
                          data-test={`style-state-${state}`}
                          data-active={styleState === state ? "true" : "false"}
                          aria-pressed={styleState === state}
                          onClick={() => {
                            setActiveStyleState(state);
                            setStyleState(state);
                          }}
                        >
                          {formatInspectorLabel(state)}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <StatusCallout
                  tone={editScope === "rendered-instance" ? "neutral" : "accent"}
                  data-test="edit-scope"
                  data-lost="false"
                >
                  {editScope === "rendered-instance" ? (
                    <>
                      <span>Editing only this rendered item.</span>
                      <Button
                        size="compact"
                        className="dt-scope__action"
                        data-test="relink-element"
                        onClick={() => {
                          const overrideId = relinkElement(selected.domElement);
                          if (overrideId) discardChangesForInstanceOverride(overrideId);
                          refreshScopeState();
                        }}
                      >
                        Relink To Source
                      </Button>
                    </>
                  ) : (
                    <div className="dt-scope__linked">
                      <span>Affects {sourceSiteMatchCount} {sourceSiteMatchCount === 1 ? "element" : "elements"}.</span>
                      {sourceSiteMatchCount > 1 ? (
                        <Button
                          size="compact"
                          variant="quiet"
                          data-test="unlink-element"
                          onClick={() => {
                            unlinkElement(selected.domElement);
                            refreshScopeState();
                          }}
                        >
                        Unlink
                        </Button>
                      ) : null}
                    </div>
                  )}
                </StatusCallout>
              </div>

              <ComponentPropsSection selected={selected} />

              <AtRuleContextProvider rows={tokenRows}>
                <div className="dt-style-editors" data-test="style-editors">
                  <LayoutSection key={`layout-${styleState}`} element={selected} entries={tokenEntries} tokenRows={tokenRows} onAfterEdit={refreshSelected} />
                  <SpacingBox key={`spacing-${styleState}`} element={selected} entries={tokenEntries} tokenRows={tokenRows} onAfterEdit={refreshSelected} />
                  <AppearanceSection key={`appearance-${styleState}`} element={selected} entries={tokenEntries} tokenRows={tokenRows} onAfterEdit={refreshSelected} />
                  <Typography key={`type-${styleState}`} element={selected} entries={tokenEntries} tokenRows={tokenRows} onAfterEdit={refreshSelected} />
                  <ColorPicker
                    key={`color-${styleState}`}
                    element={selected}
                    property="color"
                    entries={tokenEntries}
                    tokenRow={findTokenRow(tokenRows, "color")}
                    onAfterEdit={refreshSelected}
                  />
                  <ColorPicker
                    key={`background-${styleState}`}
                    element={selected}
                    property="background-color"
                    entries={tokenEntries}
                    tokenRow={backgroundTokenRow}
                    onAfterEdit={refreshSelected}
                  />
                  <BorderEditor key={`border-${styleState}`} element={selected} entries={tokenEntries} tokenRows={tokenRows} onAfterEdit={refreshSelected} />
                  <BoxShadowEditor key={`box-shadow-${styleState}`} element={selected} entries={tokenEntries} tokenRows={tokenRows} onAfterEdit={refreshSelected} />
                </div>
              </AtRuleContextProvider>
            </>
          ) : (
            <div className="dt-empty-state" data-test="empty-state">
              Select an element to edit
            </div>
          )}
          <ChangesLog
            onClearSession={restoreCount > 0 ? () => {
              clearSession();
              clearRestoreCount();
              setShowRestore(0);
            } : undefined}
          />
        </div>
      </div>
      {!isOpen ? (
        <IconButton
          label="Show inspector"
          className="dt-panel__restore"
          data-test="show-inspector"
          onClick={() => setInspectorOpen(true)}
        >
          <IconLayoutSidebarRightExpand size={18} stroke={1.8} aria-hidden="true" />
        </IconButton>
      ) : null}
    </>
  );
}
