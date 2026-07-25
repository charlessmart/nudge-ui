import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useInspectorOpen, toggleInspector, setInspectorOpen } from "./openStore.ts";
import {
  useSelectedElement,
  setSelectedElement,
} from "./selectionStore.ts";
import type { SelectedElement } from "./selectionStore.ts";
import { InspectorOverlay } from "./InspectorOverlay.tsx";
import { getAvailableInteractionStates, getAvailableTokenTableForElement, getStableTokenProperty, getTokenEntriesForElement, useResolvedPropertiesDebounced } from "./tokens/resolution.ts";
import type { ResolvedProperty } from "./tokens/resolution.ts";
import type { TokenEntry } from "virtual:design-tokens";
import { resolveSelectionFromElement } from "./resolveSelection.ts";
import { SpacingBox } from "./styleEditors/SpacingBox.tsx";
import { Typography } from "./styleEditors/Typography.tsx";
import { ColorPicker } from "./styleEditors/ColorPicker.tsx";
import { BorderEditor } from "./styleEditors/BorderEditor.tsx";
import { BorderRadiusEditor } from "./styleEditors/BorderRadiusEditor.tsx";
import { BoxShadowEditor } from "./styleEditors/BoxShadowEditor.tsx";
import { LayoutSection } from "./styleEditors/LayoutSection.tsx";
import { ChangesLog } from "./ChangesLog.tsx";
import { discardChangesForSelector, undo, redo } from "./changesLog.ts";
import { countSourceSiteMatches, getEditScope, relinkElement, selectorForElement, unlinkElement } from "./editScope.ts";
import { Button } from "./ui/Button.tsx";
import { StatusCallout } from "./ui/StatusCallout.tsx";
import { IconButton } from "./ui/IconButton.tsx";
import { UI_STYLES } from "./ui/styles.ts";
import { TokensPanel } from "./tokens/TokensPanel.tsx";
import { getActiveStyleState, setActiveStyleState } from "./styleState.ts";
import type { InteractionState } from "./styleState.ts";
import { isEditableTarget } from "./shortcuts.ts";
import { clearInspectorLayout, setInspectorLayoutOpen } from "./panelLayout.ts";
import { formatInspectorLabel } from "./ui/labels.ts";
import { CopyPromptButton } from "./CopyPromptButton.tsx";
import { useCanvasMode } from "./canvas/canvasStore.ts";
import { ModeToggle } from "./canvas/ModeToggle.tsx";
import { getRestoreCount, clearRestoreCount, clearSession } from "./canvas/sessionStore.ts";
import { getElementWindow } from "./domRealm.ts";
import { deleteElement, nudgeElement, undoDomMutation, redoDomMutation, useDomMutations } from "./domMutations.ts";

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

export function InspectorShell(): ReactElement {
  const isOpen = useInspectorOpen();
  const canvasMode = useCanvasMode();
  const selected = useSelectedElement();
  const [scopeRevision, refreshScope] = useState(0);
  const [instancePreviewLost, setInstancePreviewLost] = useState(false);
  const [activeTab, setActiveTab] = useState<"inspect" | "tokens">("inspect");
  const [styleState, setStyleState] = useState<InteractionState>(getActiveStyleState());
  const [restoreCount, setShowRestore] = useState<number>(getRestoreCount());
  const domMutations = useDomMutations();

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
    setInstancePreviewLost(false);
    if (!selected) return;
    const instancePreview = getEditScope(selected.domElement) === "instance-preview";
    // The selected element can live inside a card iframe (canvas mode); observe
    // its own ownerDocument rather than the parent app's document, otherwise
    // removal inside the iframe would never be noticed.
    const ownerRoot = selected.domElement.ownerDocument?.documentElement ?? document.documentElement;
    const OwnerMutationObserver = (getElementWindow(selected.domElement) as unknown as {
      MutationObserver: typeof MutationObserver;
    }).MutationObserver;
    const observer = new OwnerMutationObserver(() => {
      if (selected.domElement.isConnected) return;
      if (instancePreview) setInstancePreviewLost(true);
      else setSelectedElement(null);
    });
    observer.observe(ownerRoot, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [selected, scopeRevision]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeydown(event: KeyboardEvent): void {
      const mod = event.metaKey || event.ctrlKey;

      if (!isEditableTarget(event.target)) {
        const scrollKey = event.code === "Space"
          || event.key === "ArrowUp"
          || event.key === "ArrowDown"
          || event.key === "ArrowLeft"
          || event.key === "ArrowRight";
        if (scrollKey) event.preventDefault();
        if (mod && event.shiftKey && event.key.toLowerCase() === "z") {
          event.preventDefault();
          if (!redoDomMutation()) redo();
          return;
        }
        if (mod && !event.shiftKey && event.key.toLowerCase() === "z") {
          event.preventDefault();
          if (!undoDomMutation()) undo();
          return;
        }
      }

      if (!selected || isEditableTarget(event.target)) return;
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
  }, [isOpen, selected, domMutations.length]);

  const tokenRows = useResolvedPropertiesDebounced(selected, styleState);
  const tokenEntries: TokenEntry[] = selected ? getTokenEntriesForElement(selected.domElement) : [];
  const availableInteractionStates = selected ? getAvailableInteractionStates(selected.domElement) : [];
  const showInteractionState = availableInteractionStates.length > 2;
  const paintedBackgroundRow = findFirstTokenRow(tokenRows, ["background-color", "background"]);
  const backgroundTokenRow = selected
    ? paintedBackgroundRow?.tokenName
      ? paintedBackgroundRow
      : styleState === "base" ? getStableTokenProperty(selected.domElement, ["background-color", "background"], getAvailableTokenTableForElement(selected.domElement))
        ?? paintedBackgroundRow
        : paintedBackgroundRow
    : null;

  function refreshSelected(): void {
    if (!selected) return;
    const reResolved = resolveSelectionFromElement(selected.domElement);
    if (reResolved) setSelectedElement(reResolved);
  }

  function refreshScopeState(): void {
    refreshScope((revision) => revision + 1);
  }

  return (
    <>
      <style data-test="inspector-styles">{UI_STYLES}</style>
      {canvasMode === "inspect" && <InspectorOverlay host={resolveHost()} />}
      <div className="dt-panel" data-open={isOpen ? "true" : "false"}>
        <div className="dt-panel__header">
          <IconButton
            label="Collapse inspector"
            data-test="collapse-inspector"
            onClick={() => setInspectorOpen(false)}
          >
            <PanelRightClose size={16} strokeWidth={1.8} aria-hidden="true" />
          </IconButton>
          <div className="dt-panel__header-actions">
            <ModeToggle />
            <CopyPromptButton />
          </div>
        </div>
        <div className="dt-panel__tabs" role="tablist" aria-label="Inspector view">
          <Button
            variant={activeTab === "inspect" ? "secondary" : "quiet"}
            className="dt-panel__tab"
            role="tab"
            aria-selected={activeTab === "inspect"}
            data-active={activeTab === "inspect" ? "true" : "false"}
            data-test="inspect-tab"
            onClick={() => setActiveTab("inspect")}
          >
            Inspect
          </Button>
          <Button
            variant={activeTab === "tokens" ? "secondary" : "quiet"}
            className="dt-panel__tab"
            role="tab"
            aria-selected={activeTab === "tokens"}
            data-active={activeTab === "tokens" ? "true" : "false"}
            data-test="tokens-tab"
            onClick={() => setActiveTab("tokens")}
          >
            Tokens
          </Button>
        </div>
        <div className="dt-panel__body">
          {activeTab === "tokens" ? (
            <TokensPanel />
          ) : selected ? (
            <>
              <div className="dt-selection" data-test="selection" data-selected-cid={selected.cid}>
                <StatusCallout tone="neutral" data-test="dom-edit-hint">
                  Drag or use arrow keys to rearrange this element. In flex rows, Left/Right also reorder it. Press Delete/Backspace to remove it. Structural edits are temporary until applied in code.
                </StatusCallout>
                <Button
                  size="compact"
                  variant="danger"
                  data-test="delete-selected-element"
                  onClick={() => {
                    if (deleteElement(selected)) setSelectedElement(null);
                  }}
                >
                  Delete selected
                </Button>
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
                  tone={instancePreviewLost
                    ? "warning"
                    : getEditScope(selected.domElement) === "instance-preview" ? "neutral" : "accent"}
                  data-test="edit-scope"
                  data-lost={instancePreviewLost ? "true" : "false"}
                >
                  {instancePreviewLost ? (
                    "Instance preview lost. The edit was not broadened to other rendered elements."
                  ) : getEditScope(selected.domElement) === "instance-preview" ? (
                    <>
                      <span>Editing only this unlinked rendered element.</span>
                      <br />
                      <span className="dt-scope__warning">
                        This edit is active only for the current document and will not survive refresh.
                      </span>
                      <br />
                      <Button
                        size="compact"
                        className="dt-scope__action"
                        data-test="relink-element"
                        onClick={() => {
                          const instanceSelector = selectorForElement(selected.domElement);
                          if (instanceSelector) discardChangesForSelector(instanceSelector);
                          relinkElement(selected.domElement);
                          refreshScopeState();
                        }}
                      >
                        Relink To Source
                      </Button>
                    </>
                  ) : (
                    <>
                      Affects {countSourceSiteMatches(selected.domElement)} rendered {countSourceSiteMatches(selected.domElement) === 1 ? "element" : "components/elements"}.
                      {countSourceSiteMatches(selected.domElement) > 1 ? (
                        <>
                          <br />
                          <Button
                            size="compact"
                            variant="secondary"
                            className="dt-scope__action"
                            data-test="unlink-element"
                            onClick={() => {
                              unlinkElement(selected.domElement);
                              refreshScopeState();
                            }}
                          >
                            Unlink this element
                          </Button>
                        </>
                      ) : null}
                    </>
                  )}
                </StatusCallout>
              </div>

              <div className="dt-style-editors" data-test="style-editors">
                <LayoutSection key={`layout-${styleState}`} element={selected} entries={tokenEntries} tokenRows={tokenRows} onAfterEdit={refreshSelected} />
                <SpacingBox key={`spacing-${styleState}`} element={selected} entries={tokenEntries} tokenRows={tokenRows} onAfterEdit={refreshSelected} />
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
                <BorderRadiusEditor key={`border-radius-${styleState}`} element={selected} entries={tokenEntries} tokenRows={tokenRows} onAfterEdit={refreshSelected} />
                <BoxShadowEditor key={`box-shadow-${styleState}`} element={selected} entries={tokenEntries} tokenRows={tokenRows} onAfterEdit={refreshSelected} />
              </div>
            </>
          ) : null}
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
          <PanelRightOpen size={18} strokeWidth={1.8} aria-hidden="true" />
        </IconButton>
      ) : null}
    </>
  );
}
