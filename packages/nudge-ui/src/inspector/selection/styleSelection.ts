import type { SelectedElement } from "./selectionStore.ts";
import type { EditTarget } from "./editTarget.ts";
import type { InspectionSnapshot } from "../inspection/browserCssInspection.ts";
import type { ResolvedProperty } from "../../css/model/index.ts";
import {
  projectSelectionProperty,
  type SelectionProperty,
} from "../inspection/selectionProperty.ts";
import { getElementComputedStyle } from "../runtime/domRealm.ts";
import { getStateStyleValue } from "../shell/stateValue.ts";
import { getActiveStyleState } from "../shell/styleState.ts";

/** Layout roles whose controls are only safe when shared by every target. */
export type StyleRole =
  | "flex-container"
  | "flex-child"
  | "grid-container"
  | "grid-child"
  | "relative-position"
  | "inset-position";

export interface StyleSelection {
  primary: SelectedElement;
  elements: readonly SelectedElement[];
  domElements: readonly HTMLElement[];
  target: EditTarget;
  primaryRows: readonly ResolvedProperty[];
  getProperty(property: string): SelectionProperty | null;
  supportsRole(role: StyleRole): boolean;
}

function displayIs(element: HTMLElement, values: readonly string[]): boolean {
  const display = getElementComputedStyle(element).display;
  return values.includes(display);
}

function isFlexContainer(element: HTMLElement): boolean {
  return displayIs(element, ["flex", "inline-flex"]);
}

function isGridContainer(element: HTMLElement): boolean {
  return displayIs(element, ["grid", "inline-grid"]);
}

function parentDisplayIs(element: HTMLElement, values: readonly string[]): boolean {
  const parent = element.parentElement;
  return parent ? displayIs(parent, values) : false;
}

function supportsRole(element: HTMLElement, role: StyleRole): boolean {
  switch (role) {
    case "flex-container":
      return isFlexContainer(element);
    case "flex-child":
      return parentDisplayIs(element, ["flex", "inline-flex"]);
    case "grid-container":
      return isGridContainer(element);
    case "grid-child":
      return parentDisplayIs(element, ["grid", "inline-grid"]);
    case "relative-position": {
      const position = getStateStyleValue(element, "position", "static").trim().toLowerCase();
      return position === "relative" || position === "sticky";
    }
    case "inset-position": {
      const position = getStateStyleValue(element, "position", "static").trim().toLowerCase();
      return position === "absolute" || position === "fixed";
    }
  }
}

/**
 * Builds the group style projection used by all style editors. Computed CSS
 * is the value source, while individual inspection snapshots provide authored
 * and token provenance where it exists.
 */
export function createStyleSelection(
  elements: readonly SelectedElement[],
  snapshots: readonly InspectionSnapshot[],
  selectedPrimary?: SelectedElement | null,
): StyleSelection | null {
  const primary = selectedPrimary && elements.some((element) => element.domElement === selectedPrimary.domElement)
    ? selectedPrimary
    : elements.at(-1);
  if (!primary || snapshots.length !== elements.length) return null;

  const primaryIndex = elements.findIndex((element) => element.domElement === primary.domElement);
  const activeState = getActiveStyleState();
  const shouldUseInspection = elements.map(({ domElement }) => activeState !== "base"
    || [":hover", ":active", ":focus", ":focus-visible"].some((selector) => {
      try { return domElement.matches(selector); } catch { return false; }
    }));
  const rowsByProperty = snapshots.map((snapshot) =>
    new Map(snapshot.properties.map((row) => [row.property, row])));
  const computedStyles = elements.map(({ domElement }) => {
    try { return getElementComputedStyle(domElement); } catch { return null; }
  });
  const propertyCache = new Map<string, SelectionProperty>();
  function getProperty(property: string): SelectionProperty | null {
    const cached = propertyCache.get(property);
    if (cached) return cached;
    const rows = rowsByProperty.map((candidateRows) => candidateRows.get(property)
      ?? (property === "background-color" ? candidateRows.get("background") : undefined)
      ?? null);
    const values = computedStyles.map((style, index) => {
      if (shouldUseInspection[index]) {
        const row = rows[index];
        if (row?.resolvedValue) return row.resolvedValue;
      }
      return style?.getPropertyValue(property).trim() ?? "";
    });
    const projected = projectSelectionProperty(property, rows, values, primaryIndex);
    if (projected) propertyCache.set(property, projected);
    return projected;
  }
  const domElements = elements.map((element) => element.domElement);
  const target: EditTarget = domElements.length > 1 ? domElements : primary.domElement;

  return {
    primary,
    elements,
    domElements,
    target,
    primaryRows: snapshots[primaryIndex]?.properties ?? [],
    getProperty,
    supportsRole(role) {
      return domElements.every((element) => supportsRole(element, role));
    },
  };
}
