import type { ResolvedProperty } from "../../css/model/index.ts";
import type { StyleDeclaration } from "../tokens/editActions.ts";
import { findTokenRow } from "./rowLookup.ts";
import { isZeroCssValue } from "./stylePresence.ts";

export const BORDER_STYLES = ["none", "hidden", "solid", "dashed", "dotted", "double", "groove", "ridge", "inset", "outset"] as const;
type BorderStyle = (typeof BORDER_STYLES)[number];

export const BORDER_SIDES = ["top", "right", "bottom", "left"] as const;
export type BorderSide = (typeof BORDER_SIDES)[number];

export type BorderComponent = "width" | "style" | "color";

const BORDER_STYLE_SET: ReadonlySet<string> = new Set(BORDER_STYLES);
const INVISIBLE_BORDER_STYLES: ReadonlySet<string> = new Set(["none", "hidden"]);
const COMPONENT_FALLBACK = {
  width: "0px",
  style: "none",
  color: "currentcolor",
} as const satisfies Record<BorderComponent, string>;

/** Reads a property's computed value for the inspected style state. */
export type ComputedStyleReader = (property: string, fallback: string) => string;

/** What the border editor knows about one element: its cascade rows and computed style. */
export interface BorderSource {
  readonly rows: readonly ResolvedProperty[];
  readonly computed: ComputedStyleReader;
}

export interface BorderEditorState {
  /** Every side shares its width, style, and color. Never true for a group selection. */
  readonly sidesLinked: boolean;
  /** An unstructured `border` shorthand row that only a raw field can edit. */
  readonly rawShorthandRow: ResolvedProperty | null;
  /** The linked style draws a line, so linked width and color are meaningful. */
  readonly linkedStyleDraws: boolean;
  /** Rows backing the linked `border-width`, `border-style`, and `border-color` fields. */
  readonly linkedRows: Readonly<Record<BorderComponent, ResolvedProperty | null>>;
}

/** User choices the border editor turns into declarations. */
export type BorderIntent =
  | { readonly kind: "add" }
  | { readonly kind: "remove" }
  | { readonly kind: "link-sides" }
  | { readonly kind: "set-style"; readonly property: string; readonly style: string };

export function borderProperty(component: BorderComponent, side?: BorderSide): string {
  return side ? `border-${side}-${component}` : `border-${component}`;
}

function isBorderStyle(value: string): value is BorderStyle {
  return BORDER_STYLE_SET.has(value);
}

function sideProperties(component: BorderComponent): string[] {
  return BORDER_SIDES.map((side) => borderProperty(component, side));
}

/**
 * Effective value of one border width, style, or color property. Structured
 * shorthand parts win, then authored text, then the computed style.
 */
function borderComponentValue(source: BorderSource, component: BorderComponent, property: string): string {
  const row = findTokenRow(source.rows, property);
  const fallback = COMPONENT_FALLBACK[component];
  const structured = row?.structure?.[component]?.trim();
  if (component === "style") {
    if (structured) return structured.toLowerCase();
    const authored = (row?.authored ?? row?.declaredValue ?? "").trim().toLowerCase();
    if (isBorderStyle(authored)) return authored;
    return (source.computed(property, fallback) || fallback).toLowerCase();
  }
  if (structured) return structured;
  return (row?.authored || row?.declaredValue || row?.resolvedValue || source.computed(property, fallback) || fallback).trim();
}

/** Width and color compare token bindings too, so a token on one side keeps sides apart. */
function sideSignature(source: BorderSource, component: BorderComponent, property: string): string {
  const value = borderComponentValue(source, component, property).toLowerCase();
  if (component === "style") return value;
  return `${value}|${findTokenRow(source.rows, property)?.tokenName ?? ""}`;
}

/**
 * A component is linked when every side shares its value. A lone shorthand row
 * with no per-side rows is linked by construction; four different `border-*`
 * shorthands compare by their structured parts, not their full text.
 */
function componentLinked(source: BorderSource, component: BorderComponent): boolean {
  const properties = sideProperties(component);
  const hasShorthandRow = findTokenRow(source.rows, borderProperty(component)) !== null;
  const hasSideRows = properties.some((property) => findTokenRow(source.rows, property) !== null);
  if (hasShorthandRow && !hasSideRows) return true;
  return new Set(properties.map((property) => sideSignature(source, component, property))).size === 1;
}

function linkedRow(source: BorderSource, component: BorderComponent): ResolvedProperty | null {
  const shorthand = borderProperty(component);
  const direct = findTokenRow(source.rows, shorthand);
  if (direct) return direct;
  const top = findTokenRow(source.rows, borderProperty(component, "top"));
  return top ? { ...top, property: shorthand } : null;
}

export function readBorderEditor(source: BorderSource, { group }: { readonly group: boolean }): BorderEditorState {
  const borderRow = findTokenRow(source.rows, "border");
  const hasStructuredRows = source.rows.some((row) => Boolean(row.structure));
  return {
    sidesLinked: !group
      && componentLinked(source, "width")
      && componentLinked(source, "style")
      && componentLinked(source, "color"),
    rawShorthandRow: !group && borderRow && !borderRow.structure && !hasStructuredRows ? borderRow : null,
    linkedStyleDraws: !INVISIBLE_BORDER_STYLES.has(borderComponentValue(source, "style", "border-style")),
    linkedRows: {
      width: linkedRow(source, "width"),
      style: linkedRow(source, "style"),
      color: linkedRow(source, "color"),
    },
  };
}

/** Whether any side draws a visible line, including after stylesheet resets. */
export function hasVisibleBorder(computed: ComputedStyleReader): boolean {
  return BORDER_SIDES.some((side) => {
    const style = computed(borderProperty("style", side), "none").toLowerCase();
    if (INVISIBLE_BORDER_STYLES.has(style)) return false;
    return !isZeroCssValue(computed(borderProperty("width", side), "0px"));
  });
}

/** Linking sides writes each component shorthand from the top side's values. */
function linkSidesDeclarations(source: BorderSource): StyleDeclaration[] {
  const components: BorderComponent[] = ["style", "width", "color"];
  return components.map((component) => ({
    property: borderProperty(component),
    value: borderComponentValue(source, component, borderProperty(component, "top")),
  }));
}

export function borderDeclarations(source: BorderSource, intent: BorderIntent): StyleDeclaration[] {
  switch (intent.kind) {
    case "add":
      return [{ property: "border", value: "1px solid" }];
    case "remove":
      return [{ property: "border", value: "0 solid" }];
    case "link-sides":
      return linkSidesDeclarations(source);
    case "set-style":
      return isBorderStyle(intent.style) ? [{ property: intent.property, value: intent.style }] : [];
  }
}
