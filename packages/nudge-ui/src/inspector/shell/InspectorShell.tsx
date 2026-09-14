import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { IconArrowUpRight, IconColorSwatch, IconLayoutSidebarRight, IconSettings } from "@tabler/icons-react";
import { useInspectorOpen, toggleInspector, setInspectorOpen } from "./openStore.ts";
import {
  useSelectedElement,
  useSelectedElements,
  useHierarchy,
  setSelectedElement,
  removeSelectedElement,
} from "../selection/selectionStore.ts";
import { InspectorOverlay } from "../overlay/InspectorOverlay.tsx";
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
import { SpacingBox } from "../styleEditors/SpacingBox.tsx";
import { Typography } from "../styleEditors/Typography.tsx";
import { ColorPicker } from "../styleEditors/ColorPicker.tsx";
import { BorderEditor } from "../styleEditors/BorderEditor.tsx";
import { AppearanceSection } from "../styleEditors/AppearanceSection.tsx";
import { BoxShadowEditor } from "../styleEditors/BoxShadowEditor.tsx";
import { LayoutSection } from "../styleEditors/LayoutSection.tsx";
import { ChangesLog } from "./ChangesLog.tsx";
import { discardChangesForInstanceOverride, undo, redo } from "../changes/changesLog.ts";
import { countSourceSiteMatches, getEditScope, relinkElement, sourceSiteSelector, unlinkElement } from "../selection/editScope.ts";
import { canEditStyles } from "../tokens/editActions.ts";
import { Button } from "../ui/Button.tsx";
import { CopyPromptButton } from "./CopyPromptButton.tsx";
import type { SettingsSection } from "../settings/SettingsDialog.tsx";
import { StatusCallout } from "../ui/StatusCallout.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { UI_STYLES } from "../ui/styles.ts";
import { getActiveStyleState, setActiveStyleState } from "./styleState.ts";
import type { InteractionState } from "./styleState.ts";
import { isEditableEvent } from "./shortcuts.ts";
import { clearInspectorLayout, setInspectorLayoutOpen } from "./panelLayout.ts";
import { formatInspectorLabel } from "../ui/labels.ts";
import { FieldRow } from "../ui/FieldRow.tsx";
import { Select } from "../ui/Select.tsx";
import { enterCanvas, useCanvasMode } from "../canvas/canvasStore.ts";
import { clearRestoreCount, clearSession } from "../canvas/sessionStore.ts";
import { getElementWindow } from "../runtime/domRealm.ts";
import { deleteElement, nudgeElement } from "../overlay/structuralGestures.ts";
import { AtRuleContextProvider } from "../ui/AtRuleContext.tsx";
import { ComponentPropsSection } from "../componentSemantics/ComponentPropsSection.tsx";
import { cancelInlineTextEdit, disposeInlineTextEdit, isInlineTextEditingActive, useInlineTextSession } from "../inline-text/inlineTextEditor.ts";
import { useNudgeUiRuntimeConfig } from "../runtime/useRuntimeConfig.ts";
import { DomNavigation } from "./DomNavigation.tsx";
import { EmptyState } from "./EmptyState.tsx";
import { createStyleSelection } from "../selection/styleSelection.ts";
import { intersectTokenEntries } from "../inspection/selectionProperty.ts";

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
export type { SelectedElement } from "../selection/selectionStore.ts";

let inspectorHost: HTMLElement | null = null;

export function setInspectorHost(host: HTMLElement | null): void {
  inspectorHost = host;
}

function resolveHost(): HTMLElement {
  return inspectorHost ?? document.getElementById("nudge-ui-root") ?? document.body;
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
  const canvasEnabled = runtimeConfig.capabilities.canvas;
  const domNavigationEnabled = runtimeConfig.capabilities.domNavigation === true;
  const activeCanvasMode = useCanvasMode();
  const canvasMode = canvasEnabled ? activeCanvasMode : "inspect";
  const selected = useSelectedElement();
  const selectedElements = useSelectedElements();
  const hierarchy = useHierarchy();
  const inlineTextSession = useInlineTextSession();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("instructions");
  const [scopeRevision, refreshScope] = useState(0);
  const [styleState, setStyleState] = useState<InteractionState>(getActiveStyleState());
  const cssInspection = useBrowserCssInspection(selectedElements, styleState);
  const isMultiSelection = selectedElements.length > 1;

  useEffect(() => {
    setInspectorLayoutOpen(isOpen);
    return clearInspectorLayout;
  }, [isOpen]);

  useEffect(() => {
    // A new selection should never inherit an incidental state from the
    // previous element. Base is the inspector's deliberate default.
    setActiveStyleState("base");
    setStyleState("base");
  }, [selected?.domElement, isMultiSelection]);

  useEffect(() => {
    if (!selected) return;
    // The selected element can live inside a card iframe (canvas mode); observe
    // its own ownerDocument rather than the parent app's document, otherwise
    // removal inside the iframe would never be noticed.
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
    if (!isOpen) return;
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
      // macOS labels the physical Backspace key as Delete, while browsers
      // report it as "Backspace". Support both without stealing text edits.
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
  }, [isOpen, isMultiSelection, selected]);

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
  const showInteractionState = !isMultiSelection && availableInteractionStates.length > 2;
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
  const hasEditScopeCallout = !isMultiSelection
    && (editScope === "rendered-instance" || sourceSiteMatchCount > 1);
  function refreshScopeState(): void {
    refreshScope((revision) => revision + 1);
  }

  function handleCanvasModeButton(): void {
    // Inline text editing is controller-owned. Canvas renderer documents
    // receive projections only, so dispose the active controller session
    // before mounting cards rather than probing a stale iframe document.
    disposeInlineTextEdit("frame-disposed");
    enterCanvas();
  }

  function openSettings(section: SettingsSection): void {
    setSettingsSection(section);
    setSettingsOpen(true);
  }

  return (
    <>
      <style data-test="inspector-styles">{UI_STYLES}</style>
      {canvasMode === "inspect" && <InspectorOverlay host={resolveHost()} />}
      <div className="panel" data-open={isOpen ? "true" : "false"}>
        <div className="panel__tabs" aria-label="Inspector controls">
          <div
            className="panel__header-row"
            data-test="inspect-tab"
          >
            <IconButton
              variant="quiet"
              label="Collapse inspector"
              data-test="collapse-inspector"
              style={{ marginLeft: "-8px" }}
              onClick={() => {
                cancelInlineTextEdit();
                setInspectorOpen(false);
              }}
            >
              <IconLayoutSidebarRight size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
            </IconButton>
            <div className="panel__header-actions">
              <IconButton
                variant="quiet"
                data-test="tokens-button"
                label="Tokens"
                title="Tokens"
                onClick={() => openSettings("tokens")}
              >
                <IconColorSwatch size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
              </IconButton>
              <IconButton
                variant="quiet"
                label="Settings"
                title="Settings"
                data-test="settings-button"
                onClick={() => openSettings("instructions")}
              >
                <IconSettings size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
              </IconButton>
              {canvasEnabled && canvasMode !== "canvas" ? (
                <>
                  <span className="panel__header-divider" aria-hidden="true" />
                  <Button
                    variant="quiet"
                    className="panel__canvas-button"
                    data-test="mode-canvas"
                    type="button"
                    onClick={handleCanvasModeButton}
                  >
                    Canvas
                    <IconArrowUpRight size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
                  </Button>
                </>
              ) : null}
            </div>
          </div>
          <div className="panel__copy-row">
            <CopyPromptButton
              settingsOpen={settingsOpen}
              settingsSection={settingsSection}
              onOpenSettings={openSettings}
              onSettingsOpenChange={setSettingsOpen}
            />
          </div>
        </div>
        <div className="panel__body">
          {inlineTextSession && (
            inlineTextSession.bindingChoices.length > 1 ||
            inlineTextSession.scopeChoices.length > 0
          ) ? (
            <section className="inline-text-editor" data-test="inline-text-editor">
              <div className="inline-text-editor__binding" data-test="inline-text-binding">
                {inlineTextSession.binding.kind === "component-prop"
                  ? `${inlineTextSession.binding.target.componentName}.${inlineTextSession.binding.property}`
                  : "Rendered text"}
              </div>
              {inlineTextSession.bindingChoices.length > 1 ? (
                <div className="inline-text-editor__chooser" data-test="inline-binding-chooser">
                  <div className="inline-text-editor__chooser-label">Choose binding</div>
                  <div className="inline-text-editor__chooser-options" role="group" aria-label="Text binding">
                    {inlineTextSession.bindingChoices.map((choice, index) => (
                      <Button
                        key={`${choice.binding.target.callsiteId}:${choice.binding.property}`}
                        size="compact"
                        variant={inlineTextSession.selectedBindingIndex === index ? "primary" : "quiet"}
                        data-test="inline-binding-choice"
                        data-index={index}
                        aria-pressed={inlineTextSession.selectedBindingIndex === index}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => inlineTextSession.chooseBinding(index)}
                      >
                        {choice.binding.target.componentName}.{choice.binding.property}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
              {inlineTextSession.scopeChoices.length > 0 ? (
                <div className="inline-text-editor__chooser" data-test="inline-scope-chooser">
                  <div className="inline-text-editor__chooser-label">Apply to</div>
                  <div className="inline-text-editor__chooser-options" role="group" aria-label="Text edit scope">
                    {inlineTextSession.scopeChoices.map((scope) => (
                      <Button
                        key={scope}
                        size="compact"
                        variant={inlineTextSession.scope === scope ? "primary" : "quiet"}
                        data-test={`inline-scope-${scope}`}
                        aria-pressed={inlineTextSession.scope === scope}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => inlineTextSession.chooseScope(scope)}
                      >
                        {scope === "source-site" ? "All outputs" : "This rendered item"}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="inline-text-editor__actions">
                <Button
                  size="compact"
                  variant="secondary"
                  data-test="inline-text-cancel"
                  onClick={() => inlineTextSession.cancel()}
                >
                  Cancel
                </Button>
                <Button
                  size="compact"
                  data-test="inline-text-commit"
                  disabled={inlineTextSession.bindingChoices.length > 1 && inlineTextSession.selectedBindingIndex === null}
                  onClick={() => inlineTextSession.commit()}
                >
                  Done
                </Button>
              </div>
            </section>
          ) : null}
          {selected ? (
            <>
              {domNavigationEnabled && !isMultiSelection ? <DomNavigation selected={selected} hierarchy={hierarchy} /> : null}
              {isMultiSelection || showInteractionState || hasEditScopeCallout ? (
                <div
                  className={`selection${hasEditScopeCallout ? "" : " selection--without-scope-callout"}`}
                  data-test="selection"
                  data-selected-cid={selected.cid}
                  data-selected-src={selected.src}
                  data-selected-count={selectedElements.length}
                  >
                    {isMultiSelection ? (
                      <div className="selection__summary" data-test="multi-selection-summary">
                        <span className="selection__count">{selectedElements.length} elements selected</span>
                      </div>
                    ) : null}
                    {hasEditScopeCallout ? (
                      <StatusCallout
                        tone={editScope === "rendered-instance" ? "neutral" : "accent"}
                        data-test="edit-scope"
                        data-lost="false"
                      >
                        {editScope === "rendered-instance" ? (
                          <div className="scope__unlinked">
                            <span>Element unlinked</span>
                            <Button
                              size="compact"
                              className="scope__action"
                              data-test="relink-element"
                              onClick={() => {
                                const overrideId = relinkElement(selected.domElement);
                                if (overrideId) discardChangesForInstanceOverride(overrideId);
                                refreshScopeState();
                              }}
                            >
                              Relink
                            </Button>
                          </div>
                        ) : (
                          <div className="scope__linked">
                            <span>Affects {sourceSiteMatchCount} elements.</span>
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
                          </div>
                        )}
                      </StatusCallout>
                    ) : null}
                    {showInteractionState ? (
                      <FieldRow label="State" className="style-state" data-test="style-state">
                        <Select
                          value={styleState}
                          data-test="style-state-select"
                          aria-label="Style State"
                          options={availableInteractionStates.map((state) => ({
                            value: state,
                            label: formatInspectorLabel(state),
                          }))}
                          onValueChange={(state) => {
                            const nextState = availableInteractionStates.find((candidate) => candidate === state);
                            if (!nextState) return;
                            setActiveStyleState(nextState);
                            setStyleState(nextState);
                          }}
                        />
                      </FieldRow>
                    ) : null}
                </div>
              ) : null}

              {!isMultiSelection ? <ComponentPropsSection selected={selected} /> : null}

              {selectionEditable ? (
                <AtRuleContextProvider rows={tokenRows}>
                  <div className="style-editors" data-test="style-editors">
                  {/* CSS edits publish through changesLog and browser inspection;
                      component metadata does not change. LayoutSection keeps its
                      own revision for controls that depend on computed layout. */}
                  <LayoutSection key={`layout-${styleState}`} element={selected} selection={styleSelection} entries={tokenEntries} tokenRows={tokenRows} />
                  <SpacingBox key={`spacing-${styleState}`} element={selected} selection={styleSelection} entries={tokenEntries} tokenRows={tokenRows} />
                  <AppearanceSection key={`appearance-${styleState}`} element={selected} selection={styleSelection} entries={tokenEntries} tokenRows={tokenRows} />
                  <Typography key={`type-${styleState}`} element={selected} selection={styleSelection} entries={tokenEntries} tokenRows={tokenRows} />
                  <ColorPicker key={`color-${styleState}`} element={selected} selection={styleSelection} property="color" entries={tokenEntries} tokenRow={findTokenRow(tokenRows, "color")} />
                  <ColorPicker key={`background-${styleState}`} element={selected} selection={styleSelection} property="background-color" entries={tokenEntries} tokenRow={backgroundTokenRow} />
                  <BorderEditor key={`border-${styleState}`} element={selected} selection={styleSelection} entries={tokenEntries} tokenRows={tokenRows} />
                  <BoxShadowEditor key={`box-shadow-${styleState}`} element={selected} selection={styleSelection} entries={tokenEntries} tokenRows={tokenRows} />
                  </div>
                </AtRuleContextProvider>
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
            onClearSession={() => {
              clearSession();
              clearRestoreCount();
            }}
          />
        </div>
      </div>
      {!isOpen ? (
        <div className="panel__restore">
          <IconButton
            variant="quiet"
            label="Show inspector"
            className="panel__restore-button"
            data-test="show-inspector"
            onClick={() => setInspectorOpen(true)}
          >
            <IconLayoutSidebarRight size={16} stroke={"var(--icon-stroke-width)"} aria-hidden="true" />
          </IconButton>
        </div>
      ) : null}
    </>
  );
}
