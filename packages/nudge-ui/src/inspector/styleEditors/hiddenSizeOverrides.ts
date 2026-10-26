import { getStateStyleValue } from "../shell/stateValue.ts";
import { meaningfulLayoutValue } from "./layoutValue.ts";
import { INITIAL_SIZE_VALUES, type OptionalSizeProperty } from "./cssValue.ts";

export type { OptionalSizeProperty } from "./cssValue.ts";

const FLEX_CHILD_DEFAULTS: Readonly<Record<string, string>> = {
  "flex-grow": "0",
  "flex-shrink": "1",
  "flex-basis": "auto",
  "align-self": "auto",
  order: "0",
};

const GRID_CHILD_DEFAULTS: Readonly<Record<string, string>> = {
  "grid-column-start": "auto",
  "grid-column-end": "auto",
  "grid-row-start": "auto",
  "grid-row-end": "auto",
  "justify-self": "auto",
  "align-self": "auto",
};

function normalize(value: string): string {
  const trimmed = value.trim().toLowerCase();
  // `normal` is how browsers report an unset self-alignment; it behaves like `auto`.
  if (trimmed === "normal") return "auto";
  return /^0(px|%|em|rem)?$/.test(trimmed) ? "0" : trimmed;
}

/** True when the property differs from its initial value, so its field shows without being added. */
export function hasSizeOverride(el: HTMLElement, property: OptionalSizeProperty): boolean {
  const value = normalize(meaningfulLayoutValue(el, property));
  // `auto` is the initial minimum and sets no limit, the same as `0`, so removing a minimum can restore it.
  return (property.startsWith("min-") && value === "auto" ? "0" : value) !== INITIAL_SIZE_VALUES[property];
}

/** True when the flex or grid child properties of an item differ from their initial values. */
export function hasChildPlacementOverrides(el: HTMLElement, parent: { flexChild: boolean; gridChild: boolean }): boolean {
  const childDefaults = parent.flexChild ? FLEX_CHILD_DEFAULTS : parent.gridChild ? GRID_CHILD_DEFAULTS : null;
  return childDefaults !== null && Object.entries(childDefaults)
    .some(([property, initial]) => normalize(getStateStyleValue(el, property, initial)) !== initial);
}
