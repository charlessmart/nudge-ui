import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { useInspectorOpen, toggleInspector, setInspectorOpen } from "./openStore.ts";
import {
  useSelectedElement,
  useHierarchy,
  useHierarchyIndex,
  setHierarchyIndex,
  setSelectedElement,
  stepUp,
  stepDown,
} from "./selectionStore.ts";
import type { SelectedElement } from "./selectionStore.ts";
import { InspectorOverlay } from "./InspectorOverlay.tsx";
import { getStableTokenProperty, getTokenEntriesForElement, getTokenTable, useResolvedPropertiesDebounced } from "./tokens/resolution.ts";
import type { ResolvedProperty } from "./tokens/resolution.ts";
import type { TokenEntry } from "virtual:design-tokens";
import { tokens } from "virtual:design-tokens";
import { resolveSelectionFromElement } from "./resolveSelection.ts";
import { SpacingBox } from "./styleEditors/SpacingBox.tsx";
import { Typography } from "./styleEditors/Typography.tsx";
import { ColorPicker } from "./styleEditors/ColorPicker.tsx";
import { BorderEditor } from "./styleEditors/BorderEditor.tsx";
import { LayoutSection } from "./styleEditors/LayoutSection.tsx";
import { ChangesLog } from "./ChangesLog.tsx";
import { discardChangesForSelector, undo, redo } from "./changesLog.ts";
import { countSourceSiteMatches, getEditScope, relinkElement, selectorForElement, unlinkElement } from "./editScope.ts";
import { Button } from "./ui/Button.tsx";
import { StatusCallout } from "./ui/StatusCallout.tsx";
import { Breadcrumb } from "./ui/Breadcrumb.tsx";
import { UI_STYLES } from "./ui/styles.ts";
import { TokensPanel } from "./tokens/TokensPanel.tsx";

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

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function sourceLabel(selected: SelectedElement): string {
  return `${selected.file}:${selected.line}:${selected.column}`;
}

export function InspectorShell(): ReactElement {
  const isOpen = useInspectorOpen();
  const selected = useSelectedElement();
  const hierarchy = useHierarchy();
  const hierarchyIndex = useHierarchyIndex();
  const [scopeRevision, refreshScope] = useState(0);
  const [instancePreviewLost, setInstancePreviewLost] = useState(false);
  const [activeTab, setActiveTab] = useState<"inspect" | "tokens">("inspect");

  useEffect(() => {
    setInstancePreviewLost(false);
    if (!selected || getEditScope(selected.domElement) !== "instance-preview") return;
    const observer = new MutationObserver(() => {
      if (!selected.domElement.isConnected) setInstancePreviewLost(true);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [selected, scopeRevision]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeydown(event: KeyboardEvent): void {
      const mod = event.metaKey || event.ctrlKey;

      if (!isEditableTarget(event.target)) {
        if (mod && !event.shiftKey && event.key.toLowerCase() === "z") {
          event.preventDefault();
          undo();
          return;
        }
        if (mod && event.shiftKey && event.key.toLowerCase() === "z") {
          event.preventDefault();
          redo();
          return;
        }
      }

      if (!selected || isEditableTarget(event.target)) return;
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      if (event.key === "ArrowUp") stepUp();
      else stepDown();
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [isOpen, selected]);

  const ordered = [...hierarchy].reverse();
  const tokenRows = useResolvedPropertiesDebounced(selected);
  const tokenEntries: TokenEntry[] = selected ? getTokenEntriesForElement(selected.domElement) : tokens;
  const paintedBackgroundRow = findFirstTokenRow(tokenRows, ["background-color", "background"]);
  const backgroundTokenRow = selected
    ? paintedBackgroundRow?.tokenName
      ? paintedBackgroundRow
      : getStableTokenProperty(selected.domElement, ["background-color", "background"], getTokenTable())
        ?? paintedBackgroundRow
    : null;

  function refreshSelected(): void {
    if (!selected) return;
    const reResolved = resolveSelectionFromElement(selected.domElement);
    if (reResolved) setSelectedElement(reResolved);
  }

  function refreshScopeState(): void {
    refreshScope((revision) => revision + 1);
  }

  const breadcrumbItems = selected
    ? ordered.map((node, index) => {
        const realIndex = chainIndex(hierarchy.length, index);
        const cid = node.getAttribute("data-cid") ?? "?";
        return {
          id: `${realIndex}-${cid}`,
          label: cid,
          active: realIndex === hierarchyIndex,
          onSelect: () => setHierarchyIndex(realIndex),
          "data-test": "breadcrumb-step",
          "data-index": realIndex,
          "data-cid": cid,
        };
      })
    : [];

  return (
    <>
      <style data-test="inspector-styles">{UI_STYLES}</style>
      <InspectorOverlay host={resolveHost()} />
      <div className="dt-panel" data-open={isOpen ? "true" : "false"}>
        <div className="dt-panel__header">
          <span>Design Tool</span>
          <span className="dt-panel__state">{isOpen ? "open" : "closed"}</span>
        </div>
        <div className="dt-panel__tabs" role="tablist" aria-label="Inspector view">
          <Button
            variant="quiet"
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
            variant="quiet"
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
              <div className="dt-selection" data-test="selection">
                {breadcrumbItems.length > 0 ? (
                  <Breadcrumb items={breadcrumbItems} data-test="breadcrumb" />
                ) : null}
                <div className="dt-selection__row">
                  <span className="dt-selection__label">cid</span>
                  <span className="dt-selection__value">{selected.cid}</span>
                </div>
                <div className="dt-selection__row">
                  <span className="dt-selection__label">src</span>
                  <span className="dt-selection__value">{sourceLabel(selected)}</span>
                </div>
                <div className="dt-selection__row">
                  <span className="dt-selection__label">props</span>
                  <span className="dt-selection__value">{selected.cprops ?? "No props"}</span>
                </div>
                <StatusCallout
                  tone={instancePreviewLost ? "warning" : "neutral"}
                  data-test="edit-scope"
                  data-lost={instancePreviewLost ? "true" : "false"}
                >
                  {instancePreviewLost ? (
                    "Instance preview lost. The edit was not broadened to other rendered elements."
                  ) : getEditScope(selected.domElement) === "instance-preview" ? (
                    <>
                      <span>Editing only this unlinked rendered element.</span>
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
                        Re-link to source
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
                <LayoutSection element={selected} onAfterEdit={refreshSelected} />
                <SpacingBox element={selected} entries={tokenEntries} tokenRows={tokenRows} onAfterEdit={refreshSelected} />
                <Typography element={selected} entries={tokenEntries} tokenRows={tokenRows} onAfterEdit={refreshSelected} />
                <ColorPicker
                  element={selected}
                  property="color"
                  entries={tokenEntries}
                  tokenRow={findTokenRow(tokenRows, "color")}
                  onAfterEdit={refreshSelected}
                />
                <ColorPicker
                  element={selected}
                  property="background-color"
                  entries={tokenEntries}
                  tokenRow={backgroundTokenRow}
                  onAfterEdit={refreshSelected}
                />
                <BorderEditor element={selected} entries={tokenEntries} tokenRows={tokenRows} onAfterEdit={refreshSelected} />
              </div>
            </>
          ) : (
            "Inspector shell ready (Alt+I to toggle)"
          )}
          <ChangesLog />
        </div>
      </div>
    </>
  );
}

function chainIndex(length: number, reversedIndex: number): number {
  return length - 1 - reversedIndex;
}
