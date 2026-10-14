import { getLayoutValue } from "./layoutValue.ts";
import { setElementStyles, setStyle, setStyles } from "../tokens/editActions.ts";
import { countGridTracks } from "./GridPicker.tsx";
import type { ChangeRecord } from "../tokens/editActions.ts";
import { targetElements, type EditTarget } from "../selection/editTarget.ts";

/** One grid axis of a grid item: `column` maps to grid-column-*, `row` to grid-row-*. */
export type GridAxis = "column" | "row";

export type GridChildAlignment = "auto" | "stretch" | "start" | "center" | "end";

export interface GridAxisPlacement {
  start: string;
  /** Expressible as start + span N; null when the end side is auto, negative, or underivable. */
  span: number | null;
}

const LINE_NUMBER = /^-?\d+$/;
const SPAN_TOKEN = /^span\s+(\d+)$/i;

export const GRID_CHILD_MAX_TRACKS = 12;

function normalizeToken(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "auto";
}

function isLineNumber(value: string): boolean {
  return LINE_NUMBER.test(value);
}

export function parseSpanToken(value: string): number | null {
  const match = SPAN_TOKEN.exec(value.trim());
  return match ? Number(match[1]) : null;
}

/** Computed CSS stays correct even when the authored rule uses the grid-column/grid-row shorthand. */
export function readGridAxisPlacement(el: HTMLElement, axis: GridAxis): GridAxisPlacement {
  const start = getLayoutValue(el, `grid-${axis}-start`);
  const end = getLayoutValue(el, `grid-${axis}-end`);
  const startToken = normalizeToken(start.authored ?? start.computed);
  const endToken = normalizeToken(end.authored ?? end.computed);

  let span: number | null = null;
  const spanToken = parseSpanToken(endToken);
  if (spanToken !== null) {
    span = spanToken;
  } else if (isLineNumber(endToken)) {
    const endLine = Number(endToken);
    if (endLine >= 1 && isLineNumber(startToken)) {
      const derived = endLine - Number(startToken);
      if (derived >= 1) span = derived;
    }
  }

  return { start: startToken, span };
}

/** `span: "keep"` re-commits the derived span so moving the start line keeps the item's size. */
export function commitGridAxisPlacement(
  target: EditTarget,
  axis: GridAxis,
  commit: { start?: string; span?: number | "keep" },
): ChangeRecord[] {
  const elements = targetElements(target);
  const declarations: Array<{ property: string; value: string }> = [];

  if (commit.start !== undefined) {
    declarations.push({ property: `grid-${axis}-start`, value: commit.start });
  }

  let endValue: string | null = null;
  if (commit.span === "keep") {
    return setElementStyles(elements.map((element) => {
      const elementDeclarations = [...declarations];
      const current = readGridAxisPlacement(element, axis);
      if (current.span !== null) {
        elementDeclarations.push({
          property: `grid-${axis}-end`,
          value: current.span >= 2 ? `span ${current.span}` : "auto",
        });
      }
      return { element, declarations: elementDeclarations };
    }));
  } else if (typeof commit.span === "number") {
    endValue = commit.span >= 2 ? `span ${commit.span}` : "auto";
  }
  if (endValue !== null) declarations.push({ property: `grid-${axis}-end`, value: endValue });

  return declarations.length > 0 ? setStyles(target, declarations) : [];
}

/** `normal` maps to `stretch`: that is its grid-item behavior, and re-committing `auto` would change layout. */
export function readGridChildAlignment(el: HTMLElement, axis: "h" | "v"): string {
  const property = axis === "h" ? "justify-self" : "align-self";
  const value = getLayoutValue(el, property);
  const token = normalizeToken(value.authored ?? value.computed);
  return token === "normal" ? "stretch" : token;
}

export const GRID_CHILD_ALIGNMENT_OPTIONS: Array<{ value: GridChildAlignment; label: string }> = [
  { value: "auto", label: "Parent default" },
  { value: "stretch", label: "Fill" },
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
];

/** Accepts any self-alignment token, not just the picker's keywords. */
export function commitGridChildAlignment(
  target: EditTarget,
  axis: "h" | "v",
  alignment: string,
): ChangeRecord[] {
  const property = axis === "h" ? "justify-self" : "align-self";
  const record = setStyle(target, property, alignment);
  return record ? [record] : [];
}

/** Null for auto-fill/auto-fit tracks, which CSS leaves indefinite. */
export function parentTrackCount(el: HTMLElement, axis: GridAxis): number | null {
  const parent = el.parentElement;
  if (!parent) return null;
  const template = getLayoutValue(parent, `grid-template-${axis}s`);
  const count = countGridTracks(template.authored ?? template.computed ?? "");
  if (count === null) return null;
  return Math.min(count, GRID_CHILD_MAX_TRACKS);
}

/** A grid with N tracks has N+1 start lines. */
export function startLineOptions(trackCount: number | null): Array<{ value: string; label: string }> {
  const lineCount = (trackCount ?? GRID_CHILD_MAX_TRACKS) + 1;
  const options = [{ value: "auto", label: "Auto" }];
  for (let line = 1; line <= Math.max(2, lineCount); line++) {
    options.push({ value: String(line), label: String(line) });
  }
  return options;
}
