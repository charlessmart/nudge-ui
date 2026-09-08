import type { SelectedElement } from "./selectionStore.ts";
import type { EditTarget } from "./editTarget.ts";
import type { InspectionSnapshot } from "./inspection/browserCssInspection.ts";
import {
  aggregatePropertyValues,
  type AggregatedProperty,
  type PropertySnapshot,
} from "./inspection/aggregateInspection.ts";
import { getElementComputedStyle } from "./domRealm.ts";
import { getStateStyleValue } from "./stateValue.ts";
import { getActiveStyleState } from "./styleState.ts";

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
  properties: readonly AggregatedProperty[];
  getProperty(property: string): AggregatedProperty | null;
  supportsProperties(properties: readonly string[]): boolean;
  supportsRole(role: StyleRole): boolean;
}

const EDITOR_PROPERTIES = [
  "width", "height", "min-width", "min-height", "max-width", "max-height", "aspect-ratio",
  "display", "position",
  "flex-direction", "flex-wrap", "align-content", "align-items", "justify-content",
  "flex-grow", "flex-shrink", "flex-basis", "align-self", "order",
  "row-gap", "column-gap",
  "grid-template-columns", "grid-template-rows", "grid-auto-flow", "grid-auto-columns", "grid-auto-rows",
  "justify-items", "justify-self", "grid-column-start", "grid-column-end", "grid-row-start", "grid-row-end",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "top", "right", "bottom", "left",
  "opacity", "border-radius", "border-top-left-radius", "border-top-right-radius",
  "border-bottom-right-radius", "border-bottom-left-radius",
  "color", "background-color", "box-shadow",
  "border", "border-width", "border-style", "border-color",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "font-family", "font-style", "font-weight", "font-size", "line-height", "letter-spacing",
  "text-align", "vertical-align",
] as const;

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

  const propertyNames = new Set<string>(EDITOR_PROPERTIES);
  for (const snapshot of snapshots) {
    for (const row of snapshot.properties) propertyNames.add(row.property);
  }

  const propertySnapshots: readonly PropertySnapshot[] = snapshots;
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
  const properties = [...propertyNames].map((property) => {
    const values = computedStyles.map((style, index) => {
      if (shouldUseInspection[index]) {
        const rows = rowsByProperty[index];
        const row = rows?.get(property)
          ?? (property === "background-color" ? rows?.get("background") : undefined);
        if (row?.resolvedValue) return row.resolvedValue;
      }
      return style?.getPropertyValue(property).trim() ?? "";
    });
    return aggregatePropertyValues(property, propertySnapshots, values);
  }).filter((property): property is AggregatedProperty => property !== null);
  const byProperty = new Map(properties.map((property) => [property.property, property]));
  const domElements = elements.map((element) => element.domElement);
  const target: EditTarget = domElements.length > 1 ? domElements : primary.domElement;

  return {
    primary,
    elements,
    domElements,
    target,
    properties,
    getProperty(property) {
      return byProperty.get(property) ?? null;
    },
    supportsProperties(required) {
      return required.every((property) => byProperty.has(property));
    },
    supportsRole(role) {
      return domElements.every((element) => supportsRole(element, role));
    },
  };
}
