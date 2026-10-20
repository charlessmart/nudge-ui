import { getStateStyleValue } from "../shell/stateValue.ts";
import { meaningfulLayoutValue } from "./layoutValue.ts";

/** Initial values of the properties tucked behind the size expander. */
const SIZE_DEFAULTS: Readonly<Record<string, string>> = {
  "min-width": "0",
  "min-height": "0",
  "max-width": "none",
  "max-height": "none",
  "aspect-ratio": "auto",
};

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

/** True when anything the size expander hides differs from its initial value, so the toggle can flag it. */
export function hasHiddenSizeOverrides(el: HTMLElement, parent: { flexChild: boolean; gridChild: boolean }): boolean {
  const sizeChanged = Object.entries(SIZE_DEFAULTS)
    .some(([property, initial]) => normalize(meaningfulLayoutValue(el, property)) !== initial);
  if (sizeChanged) return true;
  const childDefaults = parent.flexChild ? FLEX_CHILD_DEFAULTS : parent.gridChild ? GRID_CHILD_DEFAULTS : null;
  return childDefaults !== null && Object.entries(childDefaults)
    .some(([property, initial]) => normalize(getStateStyleValue(el, property, initial)) !== initial);
}
