import { useSyncExternalStore } from "react";
import type { ComponentContract } from "../componentSemantics/types.ts";
import {
  VARIANT_ATTRIBUTE,
  parseVariantTokens,
  variantTokens,
  type VariantScope,
} from "../componentSemantics/variantMarkers.ts";
import type { InteractionState } from "./styleState.ts";
import { rankSelectProps } from "../../componentSheet/model.ts";

export const SHEET_CELL_SELECTOR = "[data-nudge-ui-sheet-cell]";
const SHEET_COMPONENT_ATTRIBUTE = "data-nudge-ui-component-sheet";
const SHEET_STATES: readonly InteractionState[] = ["hover", "active", "focus-visible", "disabled"];

let activeScope: VariantScope | null = null;
const scopeListeners = new Set<() => void>();

/** Kept outside React, like the active style state, so edit actions share the panel's choice. */
export function getActiveVariantScope(): VariantScope | null {
  return activeScope;
}

export function setActiveVariantScope(scope: VariantScope | null): void {
  if (activeScope === scope) return;
  activeScope = scope;
  scopeListeners.forEach((listener) => listener());
}

function subscribeVariantScope(listener: () => void): () => void {
  scopeListeners.add(listener);
  return () => { scopeListeners.delete(listener); };
}

export function useActiveVariantScope(): VariantScope | null {
  return useSyncExternalStore(subscribeVariantScope, getActiveVariantScope, getActiveVariantScope);
}

export function sheetCellOf(element: Element): HTMLElement | null {
  return element.closest<HTMLElement>(SHEET_CELL_SELECTOR);
}

/** The interaction state a sheet cell forces, or base. */
export function sheetCellState(cell: Element): InteractionState {
  const state = cell.getAttribute("data-nudge-ui-sheet-state");
  return SHEET_STATES.find((candidate) => candidate === state) ?? "base";
}

/** The scope an edit of this element carries: the active choice, if the element sits in a cell that renders it. */
export function variantScopeForElement(element: Element): VariantScope | undefined {
  const scope = activeScope;
  if (!scope) return undefined;
  const cell = sheetCellOf(element);
  if (!cell) return undefined;
  const marker = new Set((cell.getAttribute(VARIANT_ATTRIBUTE) ?? "").split(/\s+/));
  const covered = variantTokens(scope.componentName, scope.props).every((token) => marker.has(token));
  return covered ? { componentName: scope.componentName, props: { ...scope.props } } : undefined;
}

export interface VariantChoice {
  id: string;
  label: string;
  /** Null edits every variant. */
  scope: VariantScope | null;
}

/**
 * The contract the cell's sheet renders. Names are not unique across a project (two `Button`s), so the sheet's
 * component id decides; the name is only a fallback for a cell outside a sheet root.
 */
function contractForCell(
  cell: Element,
  contracts: readonly ComponentContract[],
  componentName: string,
): ComponentContract | undefined {
  const componentId = cell.closest(`[${SHEET_COMPONENT_ATTRIBUTE}]`)?.getAttribute(SHEET_COMPONENT_ATTRIBUTE);
  const byId = componentId ? contracts.find((candidate) => candidate.componentId === componentId) : undefined;
  return byId ?? contracts.find((candidate) => candidate.name === componentName);
}

/** "All Buttons", each select value of the cell, then the cell's whole combination, including the state props it turns on. */
export function variantChoicesForCell(
  cell: Element,
  contracts: readonly ComponentContract[],
  componentName: string,
): VariantChoice[] {
  const contract = contractForCell(cell, contracts, componentName);
  const choices: VariantChoice[] = [{ id: "all", label: `All ${componentName}s`, scope: null }];
  if (!contract) return choices;
  const marked = parseVariantTokens(componentName, cell.getAttribute(VARIANT_ATTRIBUTE));
  // Same axis order as the sheet rows, so the default choice is the variant-like prop.
  const selects = rankSelectProps(contract.props
    .filter((prop) => prop.control === "select" && prop.options.length > 1 && marked[prop.name] !== undefined));
  const values: Record<string, string | boolean> = {};
  for (const prop of selects) values[prop.name] = marked[prop.name]!;
  for (const prop of selects) {
    choices.push({
      id: `prop:${prop.name}`,
      label: `${prop.name}: ${String(values[prop.name])}`,
      scope: { componentName, props: { [prop.name]: values[prop.name]! } },
    });
  }
  // A `loading` column renders `loading: true`; leaving it out would link that column's edits to the default one.
  const switchedOn = contract.props.filter((prop) => prop.control === "boolean" && marked[prop.name] === true);
  for (const prop of switchedOn) values[prop.name] = true;
  if (selects.length + switchedOn.length > 1) {
    choices.push({
      id: "combination",
      label: [...selects.map((prop) => String(values[prop.name])), ...switchedOn.map((prop) => prop.name)].join(" · "),
      scope: { componentName, props: values },
    });
  }
  return choices;
}

/** The narrowest choice: the cell's whole combination when it has one, else its single axis, else every variant. */
export function initialVariantChoice(choices: readonly VariantChoice[]): VariantChoice | null {
  return choices[choices.length - 1] ?? null;
}

/** The component name a cell's marker describes. */
export function cellComponentName(cell: Element): string | null {
  const first = (cell.getAttribute(VARIANT_ATTRIBUTE) ?? "").split(/\s+/)[0] ?? "";
  const dot = first.indexOf(".");
  if (dot <= 0) return null;
  try {
    return decodeURIComponent(first.slice(0, dot));
  } catch {
    return null;
  }
}
