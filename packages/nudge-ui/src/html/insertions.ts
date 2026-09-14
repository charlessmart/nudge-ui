import type { StartTagLocation } from "./dom.ts";

/** Attribute text to splice into the original source at one byte offset. */
export interface Insertion {
  readonly offset: number;
  readonly text: string;
  readonly attributeCount: number;
}

/**
 * The offset just inside an opening tag's `>`, or null when the recorded
 * location does not end at a tag boundary.
 */
export function insertionOffsetFor(source: string, startTag: StartTagLocation): number | null {
  const { startOffset, endOffset } = startTag;
  if (
    startOffset < 0
    || endOffset <= startOffset
    || endOffset > source.length
    || source[endOffset - 1] !== ">"
  ) {
    return null;
  }

  // A self-closing slash belongs before the final `>`; insert before it so the
  // source remains valid (`<input data-cid="..." />`).
  return source[endOffset - 2] === "/" ? endOffset - 2 : endOffset - 1;
}

/** Splices insertions into the source, leaving every other byte untouched. */
export function applyInsertions(source: string, insertions: readonly Insertion[]): string {
  const byOffset = new Map<number, string[]>();
  for (const insertion of insertions) {
    const texts = byOffset.get(insertion.offset) ?? [];
    texts.push(insertion.text);
    byOffset.set(insertion.offset, texts);
  }

  let result = "";
  let cursor = 0;
  for (const offset of [...byOffset.keys()].sort((a, b) => a - b)) {
    result += source.slice(cursor, offset);
    result += byOffset.get(offset)!.join("");
    cursor = offset;
  }
  return result + source.slice(cursor);
}

/**
 * One-based line/column positions derived from original-source offsets.
 *
 * parse5 normalizes `\r\n` and lone `\r` to `\n` internally, so deriving
 * lines from the parser risks drift from the bytes these operations promise
 * to preserve. Offsets reference the original source, so positions are
 * computed from them directly, treating `\n`, `\r\n`, and lone `\r` as line
 * breaks the same way the HTML preprocessing specification does.
 *
 * Columns count UTF-16 code units from the line start: one column per tab,
 * matching grep-style tooling rather than editor tab stops.
 */
export interface SourcePositionIndex {
  readonly lineStarts: readonly number[];
}

export function createSourcePositionIndex(source: string): SourcePositionIndex {
  const lineStarts = [0];
  for (let offset = 0; offset < source.length; offset += 1) {
    const character = source[offset];
    if (character === "\r") {
      // A `\r\n` pair is one break; advance past its `\n` so the pair does
      // not register two line starts.
      const next = source[offset + 1];
      lineStarts.push(next === "\n" ? offset + 2 : offset + 1);
      if (next === "\n") offset += 1;
    } else if (character === "\n") {
      lineStarts.push(offset + 1);
    }
  }
  return { lineStarts };
}

/** One-based source position of an offset within the original document. */
export interface SourcePosition {
  readonly line: number;
  readonly column: number;
}

export function positionAt(positions: SourcePositionIndex, offset: number): SourcePosition {
  const { lineStarts } = positions;
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (lineStarts[middle]! <= offset) low = middle;
    else high = middle - 1;
  }
  return { line: low + 1, column: offset - lineStarts[low]! + 1 };
}
