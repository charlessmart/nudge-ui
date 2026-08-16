import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { getLayoutValue } from "./layoutValue.ts";
import { setStyles } from "./styleActions.ts";

export const GRID_PICKER_MAX_COLUMNS = 12;
export const GRID_PICKER_MAX_ROWS = 8;

interface GridDimensions {
  columns: number;
  rows: number;
}

interface PopoverPosition {
  left: number;
  top: number;
}

export interface GridPickerProps {
  domElement: HTMLElement;
  revision?: number;
  onAfterEdit?: () => void;
}

function clampDimension(value: number, max: number): number {
  return Math.max(1, Math.min(max, Math.round(value)));
}

function splitTrackList(value: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let index = 0; index < value.length; index++) {
    const char = value[index]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") depth++;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (/\s/.test(char) && depth === 0) {
      if (value.slice(start, index).trim()) parts.push(value.slice(start, index).trim());
      while (/\s/.test(value[index + 1] ?? "")) index++;
      start = index + 1;
    }
  }
  if (value.slice(start).trim()) parts.push(value.slice(start).trim());
  return parts;
}

/** Returns a definite track count, or null when CSS itself determines it. */
export function countGridTracks(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || /^(?:none|subgrid)$/i.test(trimmed)) return null;

  let count = 0;
  for (const token of splitTrackList(trimmed)) {
    const repeat = /^repeat\(\s*(\d+)\s*,/i.exec(token);
    if (repeat) {
      count += Number(repeat[1]);
      continue;
    }
    if (/^repeat\(/i.test(token)) return null;
    if (/^\[.*\]$/s.test(token)) continue;
    count++;
  }
  return count > 0 ? count : null;
}

function readDimensions(el: HTMLElement): GridDimensions {
  const columns = getLayoutValue(el, "grid-template-columns");
  const rows = getLayoutValue(el, "grid-template-rows");
  const authoredColumns = countGridTracks(columns.authored ?? "");
  const authoredRows = countGridTracks(rows.authored ?? "");
  const computedColumns = countGridTracks(columns.computed);
  const computedRows = countGridTracks(rows.computed);
  return {
    columns: clampDimension(authoredColumns ?? computedColumns ?? 1, GRID_PICKER_MAX_COLUMNS),
    rows: clampDimension(authoredRows ?? computedRows ?? 1, GRID_PICKER_MAX_ROWS),
  };
}

function gridStyle(columns: number, rows: number): CSSProperties {
  // SAFETY: CSSProperties allows custom properties through index signatures; the object only sets known custom properties.
  return {
    "--dt-grid-picker-columns": columns,
    "--dt-grid-picker-rows": rows,
  } as CSSProperties;
}

function cells(columns: number, rows: number): Array<{ column: number; row: number }> {
  return Array.from({ length: columns * rows }, (_, index) => ({
    column: (index % columns) + 1,
    row: Math.floor(index / columns) + 1,
  }));
}

export function GridPicker({ domElement: el, revision = 0, onAfterEdit }: GridPickerProps): ReactElement {
  const [dimensions, setDimensions] = useState(() => readDimensions(el));
  const [hovered, setHovered] = useState<GridDimensions | null>(null);
  const [open, setOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setDimensions(readDimensions(el));
    setHovered(null);
  }, [el, revision]);

  useLayoutEffect(() => {
    if (!open) return;

    function updatePopoverPosition(): void {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setPopoverPosition({
        left: rect.left + (rect.width / 2),
        top: rect.bottom + 6,
      });
    }

    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [open]);

  function choose(columns: number, rows: number): void {
    const next = {
      columns: clampDimension(columns, GRID_PICKER_MAX_COLUMNS),
      rows: clampDimension(rows, GRID_PICKER_MAX_ROWS),
    };
    setDimensions(next);
    setHovered(null);
    setOpen(false);
    if (setStyles(el, [
      { property: "grid-template-columns", value: `repeat(${next.columns}, minmax(0, 1fr))` },
      { property: "grid-template-rows", value: `repeat(${next.rows}, minmax(0, 1fr))` },
    ]).length > 0) {
      onAfterEdit?.();
    }
  }

  const previewCells = cells(dimensions.columns, dimensions.rows);
  const pickerCells = cells(GRID_PICKER_MAX_COLUMNS, GRID_PICKER_MAX_ROWS);
  const visible = hovered ?? dimensions;

  return (
    <div
      className="dt-grid-picker"
      data-test="layout-grid-picker"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          setHovered(null);
        }
      }}
    >
      <button
        type="button"
        className="dt-grid-picker__trigger"
        data-test="layout-grid-picker-trigger"
        ref={triggerRef}
        aria-label={`Grid ${dimensions.columns} by ${dimensions.rows}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setPopoverPosition(null);
          setOpen((current) => !current);
        }}
      >
        <span className="dt-grid-picker__preview" style={gridStyle(dimensions.columns, dimensions.rows)} aria-hidden="true">
          {previewCells.map(({ column, row }) => (
            <span className="dt-grid-picker__preview-cell" key={`${column}-${row}`} />
          ))}
          <span className="dt-grid-picker__preview-label">{dimensions.columns} × {dimensions.rows}</span>
        </span>
      </button>

      {open ? (
        <div
          className="dt-grid-picker__popover"
          data-test="layout-grid-picker-popover"
          role="dialog"
          aria-label="Choose grid size"
          style={popoverPosition ? {
            left: popoverPosition.left,
            top: popoverPosition.top,
            visibility: "visible",
          } : undefined}
        >
          <div className="dt-grid-picker__cell-grid" style={gridStyle(GRID_PICKER_MAX_COLUMNS, GRID_PICKER_MAX_ROWS)}>
            {pickerCells.map(({ column, row }) => {
              const active = column <= visible.columns && row <= visible.rows;
              return (
                <button
                  key={`${column}-${row}`}
                  type="button"
                  className={`dt-grid-picker__cell${active ? " dt-grid-picker__cell--active" : ""}`}
                  data-test={`layout-grid-cell-${column}-${row}`}
                  aria-label={`${column} columns by ${row} rows`}
                  onMouseEnter={() => setHovered({ columns: column, rows: row })}
                  onFocus={() => setHovered({ columns: column, rows: row })}
                  onClick={() => choose(column, row)}
                />
              );
            })}
          </div>
          <div className="dt-grid-picker__popover-value" aria-live="polite">
            {visible.columns} × {visible.rows}
          </div>
        </div>
      ) : null}
    </div>
  );
}
