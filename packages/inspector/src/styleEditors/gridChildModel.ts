import { getLayoutValue } from "./layoutValue.ts";
import { setStyle, setStyles } from "./styleActions.ts";
import { countGridTracks } from "./GridPicker.tsx";
import type { ChangeRecord } from "./styleActions.ts";

/** One grid axis of a grid item: `column` maps to grid-column-*, `row` to grid-row-*. */
export type GridAxis = "column" | "row";

/**
 * Alignment vocabulary for grid children. `default` defers to the container's
 * `justify-items` / `align-items` (authored as `auto`); `fill` is `stretch`.
 */
export type GridChildAlignment = "auto" | "stretch" | "start" | "center" | "end";

export interface GridAxisPlacement {
  /** Authored or computed start line token: "auto", a line number, or a named line. */
  start: string;
  /**
   * Span when the placement is expressible as start + span N: the end side is
   * `span N`, or both sides are definite positive line numbers. Null when the
   * end side is auto, a negative line, or not derivable.
   */
  span: number | null;
  /** True when the end side is a negative line (e.g. -1), i.e. "to the last line". */
  toLast: boolean;
}

export interface GridChildQuickActionState {
  fullWidth: boolean;
  fullHeight: boolean;
  centered: boolean;
  filled: boolean;
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

/** Parses a `span N` end-side token into N. */
export function parseSpanToken(value: string): number | null {
  const match = SPAN_TOKEN.exec(value.trim());
  return match ? Number(match[1]) : null;
}

/**
 * Reads one placement axis from authored CSS (preferred) falling back to
 * computed CSS, which stays correct even when the authored rule uses the
 * `grid-column` / `grid-row` shorthand.
 */
export function readGridAxisPlacement(el: HTMLElement, axis: GridAxis): GridAxisPlacement {
  const start = getLayoutValue(el, `grid-${axis}-start`);
  const end = getLayoutValue(el, `grid-${axis}-end`);
  const startToken = normalizeToken(start.authored ?? start.computed);
  const endToken = normalizeToken(end.authored ?? end.computed);

  let span: number | null = null;
  let toLast = false;
  const spanToken = parseSpanToken(endToken);
  if (spanToken !== null) {
    span = spanToken;
  } else if (isLineNumber(endToken)) {
    const endLine = Number(endToken);
    // Only -1 names the last track line; -2 and beyond are earlier lines
    // whose resolution depends on the track count, so they are neither a
    // simple span nor "to last".
    if (endLine === -1) {
      toLast = true;
    } else if (endLine >= 1 && isLineNumber(startToken)) {
      const derived = endLine - Number(startToken);
      if (derived >= 1) span = derived;
    }
  }

  return { start: startToken, span, toLast };
}

/**
 * Commits one placement axis as managed longhands. The UI model is
 * "start line + span", so editing either side recomposes both:
 * a simple span is rewritten as `span N` (or `auto` for 1), while a negative
 * end line ("to the last line") and plain auto ends are preserved untouched.
 * `span: "keep"` re-commits the currently derived span, if any, so moving the
 * start line keeps the item's size.
 */
export function commitGridAxisPlacement(
  el: HTMLElement,
  axis: GridAxis,
  commit: { start?: string; span?: number | "keep" },
): ChangeRecord[] {
  const declarations: Array<{ property: string; value: string }> = [];

  if (commit.start !== undefined) {
    declarations.push({ property: `grid-${axis}-start`, value: commit.start });
  }

  let endValue: string | null = null;
  if (commit.span === "keep") {
    const current = readGridAxisPlacement(el, axis);
    if (current.span !== null) endValue = current.span >= 2 ? `span ${current.span}` : "auto";
  } else if (typeof commit.span === "number") {
    endValue = commit.span >= 2 ? `span ${commit.span}` : "auto";
  }
  if (endValue !== null) declarations.push({ property: `grid-${axis}-end`, value: endValue });

  return declarations.length > 0 ? setStyles(el, declarations) : [];
}

/**
 * Reads one self-alignment axis as a raw CSS token with `normal` mapped to
 * `stretch`: on grid items `normal` has stretch behavior (except replaced
 * elements), so labeling it "Parent default" would misdescribe the rendering
 * and re-committing `auto` for it could change the layout. `auto` alone means
 * the item defers to the container's `justify-items` / `align-items`.
 */
export function readGridChildAlignment(el: HTMLElement, axis: "h" | "v"): string {
  const property = axis === "h" ? "justify-self" : "align-self";
  const value = getLayoutValue(el, property);
  const token = normalizeToken(value.authored ?? value.computed);
  return token === "normal" ? "stretch" : token;
}

/** Friendly alignment labels; `auto` resolves to the container's items alignment. */
export const GRID_CHILD_ALIGNMENT_OPTIONS: Array<{ value: GridChildAlignment; label: string }> = [
  { value: "auto", label: "Parent default" },
  { value: "stretch", label: "Fill" },
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
];

/**
 * Commits one self-alignment axis. The alignment vocabulary is an open CSS
 * set — the friendly pickers cover the common keywords while authored values
 * such as `self-start` or `normal` round-trip verbatim — so this accepts any
 * self-alignment token the UI puts in its options.
 */
export function commitGridChildAlignment(
  el: HTMLElement,
  axis: "h" | "v",
  alignment: string,
): ChangeRecord[] {
  const property = axis === "h" ? "justify-self" : "align-self";
  const record = setStyle(el, property, alignment);
  return record ? [record] : [];
}

export type GridChildQuickAction = "full-width" | "full-height" | "center" | "fill";

/** One-click placement/alignment presets committed as managed declarations. */
export function commitGridChildQuickAction(
  el: HTMLElement,
  action: GridChildQuickAction,
): ChangeRecord[] {
  switch (action) {
    case "full-width":
      return setStyles(el, [{ property: "grid-column", value: "1 / -1" }]);
    case "full-height":
      return setStyles(el, [{ property: "grid-row", value: "1 / -1" }]);
    case "center":
      return setStyles(el, [
        { property: "justify-self", value: "center" },
        { property: "align-self", value: "center" },
      ]);
    case "fill":
      return setStyles(el, [
        { property: "justify-self", value: "stretch" },
        { property: "align-self", value: "stretch" },
      ]);
  }
}

export function readGridChildQuickActionState(el: HTMLElement): GridChildQuickActionState {
  const column = readGridAxisPlacement(el, "column");
  const row = readGridAxisPlacement(el, "row");
  const horizontal = readGridChildAlignment(el, "h");
  const vertical = readGridChildAlignment(el, "v");
  return {
    fullWidth: column.toLast && column.start === "1",
    fullHeight: row.toLast && row.start === "1",
    centered: horizontal === "center" && vertical === "center",
    filled: horizontal === "stretch" && vertical === "stretch",
  };
}

/**
 * Resolved track count of the parent grid on one axis, when CSS makes it
 * definite (auto-fill/auto-fit tracks cannot be counted). Caps at
 * GRID_CHILD_MAX_TRACKS to bound generated line options.
 */
export function parentTrackCount(el: HTMLElement, axis: GridAxis): number | null {
  const parent = el.parentElement;
  if (!parent) return null;
  const template = getLayoutValue(parent, `grid-template-${axis}s`);
  const count = countGridTracks(template.authored ?? template.computed ?? "");
  if (count === null) return null;
  return Math.min(count, GRID_CHILD_MAX_TRACKS);
}

/**
 * Start-line options for one axis: Auto plus explicit line numbers. A grid
 * with N tracks has N+1 lines, so the final start line is count + 1.
 */
export function startLineOptions(trackCount: number | null): Array<{ value: string; label: string }> {
  const lineCount = (trackCount ?? GRID_CHILD_MAX_TRACKS) + 1;
  const options = [{ value: "auto", label: "Auto" }];
  for (let line = 1; line <= Math.max(2, lineCount); line++) {
    options.push({ value: String(line), label: String(line) });
  }
  return options;
}
