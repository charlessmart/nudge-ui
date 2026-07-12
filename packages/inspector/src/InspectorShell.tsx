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
import { InspectorOverlay } from "./InspectorOverlay.tsx";
import { getTokenEntriesForElement, useResolvedPropertiesDebounced } from "./tokens/resolution.ts";
import type { ResolvedProperty } from "./tokens/resolution.ts";
import type { TokenEntry } from "virtual:design-tokens";
import { tokens } from "virtual:design-tokens";
import { TokenDropdown } from "./tokens/TokenDropdown.tsx";
import { resolveSelectionFromElement } from "./resolveSelection.ts";
import { SpacingBox } from "./styleEditors/SpacingBox.tsx";
import { Typography } from "./styleEditors/Typography.tsx";
import { ColorPicker } from "./styleEditors/ColorPicker.tsx";
import { BorderEditor } from "./styleEditors/BorderEditor.tsx";
import { LayoutSection } from "./styleEditors/LayoutSection.tsx";
import { ChangesLog } from "./ChangesLog.tsx";
import { discardChangesForSelector, undo, redo } from "./changesLog.ts";
import { countSourceSiteMatches, getEditScope, relinkElement, selectorForElement, unlinkElement } from "./editScope.ts";

const HANDLED_PROPERTIES = new Set([
  "color", "background-color", "background",
  "padding", "margin",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "font-size", "font-weight", "font-family", "line-height", "letter-spacing",
  "border-width", "border-style", "border-color", "border",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-radius", "box-shadow",
  // Layout properties
  "display", "position",
  "flex-direction", "justify-content", "align-items", "flex-wrap", "align-content",
  "row-gap", "column-gap",
  "flex-grow", "flex-shrink", "flex-basis",
  "align-self", "order",
  "top", "right", "bottom", "left",
]);

function findTokenRow(rows: ResolvedProperty[], prop: string): ResolvedProperty | null {
  return rows.find((r) => r.property === prop) ?? null;
}

export { toggleInspector, setInspectorOpen };
export type { SelectedElement } from "./selectionStore.ts";

let inspectorHost: HTMLElement | null = null;
export function setInspectorHost(host: HTMLElement | null): void {
  inspectorHost = host;
}

const STYLES = `
:host { all: initial; }
.dt-panel {
  position: fixed;
  bottom: 16px;
  right: 16px;
  width: 320px;
  height: 90dvh;
  background: #111827;
  color: #f9fafb;
  border: 1px solid #374151;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.35);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  z-index: 2147483647;
}
.dt-panel[data-open="false"] { display: none; }
.dt-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid #374151;
  font-weight: 600;
}
.dt-panel__body {
  padding: 12px;
  color: #d1d5db;
  overflow: auto;
  flex: 1;
}
.dt-selection {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dt-selection__row {
  display: flex;
  gap: 6px;
}
.dt-selection__label {
  color: #9ca3af;
  min-width: 56px;
}
.dt-selection__value {
  color: #f9fafb;
  word-break: break-all;
}
.dt-scope { margin-top: 6px; padding: 7px; border: 1px solid #374151; border-radius: 4px; color: #d1d5db; }
.dt-scope button { margin-top: 5px; background: #1f2937; color: #f9fafb; border: 1px solid #4b5563; border-radius: 4px; padding: 3px 7px; font: inherit; cursor: pointer; }
.dt-scope[data-lost="true"] { border-color: #b45309; color: #fbbf24; }
.dt-breadcrumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
}
.dt-breadcrumb__sep {
  color: #6b7280;
}
.dt-breadcrumb__step {
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  color: #9ca3af;
  background: transparent;
  border: none;
  font: inherit;
}
.dt-breadcrumb__step[data-active="true"] {
  color: #f9fafb;
  background: #1f2937;
  font-weight: 600;
}
.dt-hover-outline {
  position: fixed;
  pointer-events: none;
  outline: 2px solid #3b82f6;
  outline-offset: -2px;
  z-index: 2147483646;
}
.dt-selected-outline {
  position: fixed;
  pointer-events: none;
  outline: 2px solid #ef4444;
  outline-offset: -2px;
  z-index: 2147483646;
}
.dt-tokens {
  margin-top: 8px;
  border-top: 1px solid #374151;
  padding-top: 8px;
}
.dt-tokens__title {
  color: #9ca3af;
  margin-bottom: 6px;
  font-weight: 600;
}
.dt-tokens__empty {
  color: #6b7280;
}
.dt-tokens__row {
  display: grid;
  grid-template-columns: 88px 1fr;
  gap: 4px;
  padding: 2px 0;
  align-items: baseline;
}
.dt-tokens__prop {
  color: #f9fafb;
  font-feature-settings: "tnum";
  word-break: break-all;
}
.dt-tokens__name {
  color: #93c5fd;
  word-break: break-all;
}
.dt-tokens__name[data-token="false"] {
  color: #6b7280;
}
.dt-tokens__value {
  grid-column: 2;
  color: #9ca3af;
  font-size: 11px;
  word-break: break-all;
}
.dt-token-dropdown {
  grid-column: 2;
  margin: 2px 0 4px;
}
.dt-token-dropdown select {
  width: 100%;
  background: #1f2937;
  color: #f9fafb;
  border: 1px solid #374151;
  border-radius: 4px;
  padding: 2px 4px;
  font: inherit;
  font-size: 11px;
}
.dt-style-editors {
  margin-top: 8px;
  border-top: 1px solid #374151;
  padding-top: 8px;
}
.dt-style-editors__title {
  color: #9ca3af;
  margin-bottom: 6px;
  font-weight: 600;
}
.dt-editor {
  margin-bottom: 10px;
  padding: 6px;
  background: #0f1623;
  border: 1px solid #1f2937;
  border-radius: 4px;
}
.dt-editor__title {
  color: #93c5fd;
  font-weight: 600;
  margin-bottom: 4px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.dt-layout {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dt-layout__group {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid #1f2937;
}
.dt-layout__group-title {
  color: #93c5fd;
  font-weight: 600;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
}
.dt-layout-field {
  display: grid;
  grid-template-columns: 88px 1fr;
  gap: 4px;
  align-items: center;
}
.dt-layout-field__label {
  color: #9ca3af;
  font-size: 11px;
}
.dt-layout-field__select {
  width: 100%;
  background: #1f2937;
  color: #f9fafb;
  border: 1px solid #374151;
  border-radius: 4px;
  padding: 2px 4px;
  font: inherit;
  font-size: 11px;
}
.dt-layout__inset-grid {
  display: grid;
  grid-template-columns: 14px repeat(4, 1fr);
  gap: 3px;
  align-items: center;
}
.dt-layout__inset-label {
  color: #6b7280;
  font-size: 9px;
  text-align: center;
}
.dt-layout__gap-row {
  margin-top: 2px;
}
.dt-layout__gap-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}
.dt-layout-combo {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dt-layout-combo--compact .dt-layout-combo__select {
  font-size: 10px;
  padding: 1px 3px;
}
.dt-layout-combo__select {
  width: 100%;
  background: #1f2937;
  color: #f9fafb;
  border: 1px solid #374151;
  border-radius: 4px;
  padding: 2px 4px;
  font: inherit;
  font-size: 11px;
}
.dt-layout-combo__custom {
  display: flex;
}
.dt-layout-combo__input {
  width: 100%;
  background: #1f2937;
  color: #f9fafb;
  border: 1px solid #374151;
  border-radius: 4px;
  padding: 2px 4px;
  font: inherit;
  font-size: 11px;
}
.dt-layout-combo--compact .dt-layout-combo__input {
  font-size: 10px;
  padding: 1px 3px;
}
.dt-spacing {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dt-spacing__group {
  display: grid;
  grid-template-columns: 48px repeat(4, 1fr);
  gap: 4px;
  align-items: center;
}
.dt-spacing__label {
  color: #9ca3af;
  font-size: 11px;
}
.dt-spacing__side {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dt-spacing__side-label {
  color: #6b7280;
  font-size: 9px;
}
.dt-typography,
.dt-border,
.dt-color {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dt-field {
  display: grid;
  grid-template-columns: 88px 1fr;
  gap: 4px;
  align-items: center;
}
.dt-field__label {
  color: #9ca3af;
  font-size: 11px;
}
.dt-field__row {
  display: flex;
  gap: 4px;
  align-items: center;
}
.dt-field__unit {
  color: #6b7280;
  font-size: 11px;
}
.dt-editor input,
.dt-editor select {
  width: 100%;
  background: #1f2937;
  color: #f9fafb;
  border: 1px solid #374151;
  border-radius: 4px;
  padding: 2px 4px;
  font: inherit;
  font-size: 11px;
}
.dt-field__row input {
  flex: 1;
}
.dt-color__row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.dt-color__swatch {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: 1px solid #374151;
}
.dt-color__computed {
  color: #d1d5db;
  font-size: 11px;
  word-break: break-all;
}
.dt-changes {
  margin-top: 8px;
  border-top: 1px solid #374151;
  padding-top: 8px;
}
.dt-changes__title {
  color: #9ca3af;
  margin-bottom: 6px;
  font-weight: 600;
}
.dt-changes__empty {
  color: #6b7280;
}
.dt-changes__group {
  margin-bottom: 8px;
  padding: 6px;
  background: #0f1623;
  border: 1px solid #1f2937;
  border-radius: 4px;
}
.dt-changes__group-title {
  color: #93c5fd;
  font-weight: 600;
  font-size: 11px;
  margin-bottom: 4px;
}
.dt-changes__group-file {
  color: #6b7280;
  font-weight: 400;
  word-break: break-all;
}
.dt-changes__row {
  display: grid;
  grid-template-columns: 64px 1fr auto 1fr auto;
  gap: 4px;
  align-items: center;
  padding: 2px 0;
  font-size: 11px;
}
.dt-changes__prop {
  color: #f9fafb;
  word-break: break-all;
}
.dt-changes__before {
  color: #9ca3af;
  word-break: break-all;
}
.dt-changes__arrow {
  color: #6b7280;
}
.dt-changes__after {
  color: #93c5fd;
  word-break: break-all;
}
.dt-changes__conflict {
  grid-column: 1 / -1;
  color: #f0a060;
  font-size: 10px;
}
.dt-changes__revert {
  background: #1f2937;
  color: #f9fafb;
  border: 1px solid #374151;
  border-radius: 4px;
  padding: 2px 6px;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.dt-changes__revert:hover {
  background: #374151;
}
.dt-changes__copy {
  display: block;
  width: 100%;
  margin-bottom: 8px;
  background: #1d4ed8;
  color: #f9fafb;
  border: 1px solid #1e40af;
  border-radius: 4px;
  padding: 4px 8px;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.dt-changes__copy:hover:not(:disabled) {
  background: #2563eb;
}
.dt-changes__copy:disabled {
  background: #1f2937;
  color: #6b7280;
  border-color: #374151;
  cursor: not-allowed;
}
.dt-changes__copy[data-copied="true"] {
  background: #047857;
  border-color: #065f46;
}
.dt-tokens-other {
  margin-top: 8px;
  padding-top: 8px;
}
.dt-field--token {
  margin-top: -2px;
}
.dt-token-field {
  position: relative;
  display: flex;
  gap: 4px;
  align-items: center;
  width: 100%;
}
.dt-token-field .dt-token-dropdown {
  grid-column: unset;
  margin: 0;
  flex: 1;
}
.dt-delink-btn {
  background: transparent;
  border: 1px solid #374151;
  border-radius: 3px;
  color: #6b7280;
  cursor: pointer;
  padding: 2px 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.dt-delink-btn:hover {
  color: #f9fafb;
  border-color: #ef4444;
}
.dt-raw-input {
  flex: 1;
  background: #1f2937;
  color: #f9fafb;
  border: 1px solid #374151;
  border-radius: 4px;
  padding: 2px 4px;
  font: inherit;
  font-size: 11px;
}
.dt-suggestion-popover {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  max-height: 160px;
  overflow-y: auto;
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 4px;
  z-index: 10;
  margin-top: 2px;
}
.dt-suggestion-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  cursor: pointer;
  font-size: 11px;
}
.dt-suggestion-item:hover {
  background: #374151;
}
.dt-suggestion-item__swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  border: 1px solid #374151;
  flex-shrink: 0;
}
.dt-suggestion-item__name {
  color: #93c5fd;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dt-suggestion-item__value {
  color: #6b7280;
  font-size: 10px;
  white-space: nowrap;
}
`;

function resolveHost(): HTMLElement {
  return inspectorHost ?? document.getElementById("design-tool-root") ?? document.body;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function InspectorShell(): ReactElement {
  const isOpen = useInspectorOpen();
  const selected = useSelectedElement();
  const hierarchy = useHierarchy();
  const hierarchyIndex = useHierarchyIndex();
  const [scopeRevision, refreshScope] = useState(0);
  const [instancePreviewLost, setInstancePreviewLost] = useState(false);

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
    function onKeydown(e: KeyboardEvent): void {
      const mod = e.metaKey || e.ctrlKey;

      if (!isEditableTarget(e.target) && selected) {
        if (mod && !e.shiftKey && e.key.toLowerCase() === "z") {
          e.preventDefault();
          undo();
          return;
        }
        if (mod && e.shiftKey && e.key.toLowerCase() === "z") {
          e.preventDefault();
          redo();
          return;
        }
      }

      if (!selected) return;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      if (e.key === "ArrowUp") stepUp();
      else stepDown();
    }
    window.addEventListener("keydown", onKeydown);
    return () => {
      window.removeEventListener("keydown", onKeydown);
    };
  }, [isOpen, selected]);

  const ordered = [...hierarchy].reverse();

  const tokenRows = useResolvedPropertiesDebounced(selected);
  const tokenEntries: TokenEntry[] = selected ? getTokenEntriesForElement(selected.domElement) : tokens;

  function refreshSelected(): void {
    if (!selected) return;
    const reResolved = resolveSelectionFromElement(selected.domElement);
    if (!reResolved) return;
    setSelectedElement(reResolved);
  }

  return (
    <>
      <style>{STYLES}</style>
      <InspectorOverlay host={resolveHost()} />
      <div className="dt-panel" data-open={isOpen ? "true" : "false"}>
        <div className="dt-panel__header">
          <span>Design Tool</span>
          <span>{isOpen ? "open" : "closed"}</span>
        </div>
        <div className="dt-panel__body">
          {selected ? (
            <>
            <div className="dt-selection" data-test="selection">
              {ordered.length > 0 ? (
                <div className="dt-breadcrumb" data-test="breadcrumb">
                  {ordered.map((node, i) => {
                    const realIndex = chainIndex(hierarchy.length, i);
                    const cid = node.getAttribute("data-cid") ?? "?";
                    const active = realIndex === hierarchyIndex;
                    return (
                      <span key={realIndex}>
                        {i > 0 ? <span className="dt-breadcrumb__sep"> › </span> : null}
                        <button
                          type="button"
                          className="dt-breadcrumb__step"
                          data-test="breadcrumb-step"
                          data-active={active ? "true" : "false"}
                          data-index={realIndex}
                          data-cid={cid}
                          onClick={() => setHierarchyIndex(realIndex)}
                        >
                          {cid}
                        </button>
                      </span>
                    );
                  })}
                </div>
              ) : null}
              <div className="dt-selection__row">
                <span className="dt-selection__label">cid</span>
                <span className="dt-selection__value">{selected.cid}</span>
              </div>
              <div className="dt-selection__row">
                <span className="dt-selection__label">src</span>
                <span className="dt-selection__value">
                  {selected.file}:{selected.line}:{selected.column}
                </span>
              </div>
              <div className="dt-selection__row">
                <span className="dt-selection__label">props</span>
                <span className="dt-selection__value">
                  {selected.cprops ?? "No props"}
                </span>
              </div>
              <div className="dt-scope" data-test="edit-scope" data-lost={instancePreviewLost ? "true" : "false"}>
                {instancePreviewLost ? (
                  <span>Instance preview lost. The edit was not broadened to other rendered elements.</span>
                ) : getEditScope(selected.domElement) === "instance-preview" ? (
                  <>
                    <span>Editing only this unlinked rendered element.</span><br />
                    <button type="button" data-test="relink-element" onClick={() => {
                      const instanceSelector = selectorForElement(selected.domElement);
                      if (instanceSelector) discardChangesForSelector(instanceSelector);
                      relinkElement(selected.domElement);
                      refreshScope((n) => n + 1);
                    }}>Re-link to source</button>
                  </>
                ) : (
                  <>
                    <span>Affects {countSourceSiteMatches(selected.domElement)} rendered {countSourceSiteMatches(selected.domElement) === 1 ? "element" : "components/elements"}.</span>
                    {countSourceSiteMatches(selected.domElement) > 1 ? (
                      <><br /><button type="button" data-test="unlink-element" onClick={() => { unlinkElement(selected.domElement); refreshScope((n) => n + 1); }}>Unlink this element</button></>
                    ) : null}
                  </>
                )}
              </div>
            </div>
            <div className="dt-tokens" data-test="tokens-panel">
              <div className="dt-tokens__title">Tokens</div>
              {tokenRows.length === 0 ? (
                <div className="dt-tokens__empty">No attributable CSS declarations on this element</div>
              ) : tokenRows.map((row) => (
                <div
                  className="dt-tokens__row"
                  data-test="token-row"
                  key={row.property}
                  data-property={row.property}
                  data-token={row.tokenName ?? ""}
                  data-confidence={row.confidence}
                >
                  <span className="dt-tokens__prop" data-test="token-property">{row.property}</span>
                  <span className="dt-tokens__name" data-test="token-name" data-token={row.tokenName ? "true" : "false"}>
                    {row.tokenName ?? "not a token"}
                  </span>
                  <span className={`dt-token-confidence dt-token-confidence--${row.confidence}`} data-test="token-confidence">
                    {row.confidence}
                  </span>
                  <span className="dt-tokens__value" data-test="token-value">{row.resolvedValue}</span>
                  <TokenDropdown row={row} domElement={selected.domElement} entries={tokenEntries} onAfterEdit={refreshSelected} />
                </div>
              ))}
            </div>
            <div className="dt-style-editors" data-test="style-editors">
              <LayoutSection
                element={selected}
                onAfterEdit={refreshSelected}
              />
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
                tokenRow={findTokenRow(tokenRows, "background-color") ?? findTokenRow(tokenRows, "background")}
                onAfterEdit={refreshSelected}
              />
              <SpacingBox
                element={selected}
                entries={tokenEntries}
                tokenRows={tokenRows}
                onAfterEdit={refreshSelected}
              />
              <Typography
                element={selected}
                entries={tokenEntries}
                tokenRows={tokenRows}
                onAfterEdit={refreshSelected}
              />
              <BorderEditor
                element={selected}
                entries={tokenEntries}
                tokenRows={tokenRows}
                onAfterEdit={refreshSelected}
              />
              {tokenRows.filter((r) => !HANDLED_PROPERTIES.has(r.property)).length > 0 ? (
                <div className="dt-tokens-other" data-test="tokens-other">
                  <div className="dt-tokens__title">Other tokens</div>
                  {tokenRows
                    .filter((r) => !HANDLED_PROPERTIES.has(r.property))
                    .map((row) => (
                      <div
                        className="dt-tokens__row"
                        data-test="token-row"
                        key={row.property}
                        data-property={row.property}
                        data-token={row.tokenName ?? ""}
                        data-confidence={row.confidence}
                      >
                        <span className="dt-tokens__prop" data-test="token-property">
                          {row.property}
                        </span>
                        <span
                          className="dt-tokens__name"
                          data-test="token-name"
                          data-token={row.tokenName ? "true" : "false"}
                        >
                          {row.tokenName ?? "not a token"}
                        </span>
                        <span className={`dt-token-confidence dt-token-confidence--${row.confidence}`} data-test="token-confidence">
                          {row.confidence}
                        </span>
                        <span className="dt-tokens__value" data-test="token-value">
                          {row.resolvedValue}
                        </span>
                        <TokenDropdown
                          row={row}
                          domElement={selected.domElement}
                          entries={tokenEntries}
                          onAfterEdit={refreshSelected}
                        />
                      </div>
                    ))}
                </div>
              ) : null}
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
