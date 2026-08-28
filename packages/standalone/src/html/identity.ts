import { parse, type DefaultTreeAdapterTypes, type ParserError } from "parse5";
import { NUDGE_UI_MOUNT_ID } from "../manifest.ts";

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const EXCLUDED_TAG_NAMES = new Set([
  "html",
  "head",
  "body",
  "script",
  "style",
  "template",
  "noscript",
]);

type HtmlElement = DefaultTreeAdapterTypes.Element;
type ElementLocation = NonNullable<HtmlElement["sourceCodeLocation"]>;
type StartTagLocation = NonNullable<ElementLocation["startTag"]>;

/** A diagnostic emitted while parsing or instrumenting one HTML document. */
export interface HtmlIdentityDiagnostic {
  /** Identifies the parser or instrumentation condition. */
  readonly code: HtmlIdentityDiagnosticCode;
  /** The severity of the diagnostic. */
  readonly severity: "warning";
  /** A human-readable explanation. */
  readonly message: string;
  /** The project-relative HTML file associated with the diagnostic. */
  readonly file: string;
  /** One-based source line, when the parser supplied one. */
  readonly line?: number;
  /** One-based source column, when the parser supplied one. */
  readonly column?: number;
  /** Zero-based source offset, when the parser supplied one. */
  readonly offset?: number;
}

/** Codes that can be returned in the identity module's diagnostics. */
export type HtmlIdentityDiagnosticCode =
  | "html-parse-error"
  | "missing-source-location"
  | "invalid-source-location";

/** The result of instrumenting one source document. */
export interface HtmlIdentityResult {
  /** The original source with identity attributes inserted at parser offsets. */
  readonly html: string;
  /** Parser and instrumentation diagnostics in source order. */
  readonly diagnostics: readonly HtmlIdentityDiagnostic[];
  /** The number of attributes inserted into the returned source. */
  readonly insertedAttributeCount: number;
}

interface Insertion {
  readonly offset: number;
  readonly text: string;
  readonly attributeCount: number;
}

/**
 * Adds source identity to eligible HTML elements without reserializing the
 * document.
 *
 * The parser supplies the element tree and original source locations. The
 * implementation only inserts missing attributes at the end of each opening
 * tag, so whitespace, quoting, entities, attribute order, and malformed input
 * outside those insertions remain byte-for-byte unchanged.
 *
 * @param source The HTML response body to inspect.
 * @param file The project-relative HTML file identity used in `data-src`.
 * @returns Transformed source and diagnostics from the parser or inserter.
 */
export function instrumentHtml(
  source: string,
  file: string,
): HtmlIdentityResult {
  const diagnostics: HtmlIdentityDiagnostic[] = [];
  const parseErrors: ParserError[] = [];
  const document = parse(source, {
    sourceCodeLocationInfo: true,
    onParseError: (error) => parseErrors.push(error),
  });
  const positions = createSourcePositionIndex(source);

  for (const error of parseErrors) {
    // A missing doctype does not affect source locations or browser DOM
    // identity, so do not turn ordinary HTML fragments into warning-heavy
    // results. Other parser errors can affect the tree and are useful to the
    // standalone server's diagnostics stream.
    if (error.code === "missing-doctype") continue;
    diagnostics.push({
      code: "html-parse-error",
      severity: "warning",
      message: `HTML parser reported ${error.code}.`,
      file,
      line: error.startLine,
      column: error.startCol,
      offset: error.startOffset,
    });
  }

  const insertions: Insertion[] = [];
  const bodyElements = findBodyElements(document);

  for (const body of bodyElements) {
    for (const child of body.childNodes) {
      if (isElement(child)) {
        visitElement(child, source, file, positions, insertions, diagnostics);
      }
    }
  }

  if (insertions.length === 0) {
    return {
      html: source,
      diagnostics,
      insertedAttributeCount: 0,
    };
  }

  return {
    html: applyInsertions(source, insertions),
    diagnostics,
    insertedAttributeCount: insertions.reduce(
      (count, insertion) => count + insertion.attributeCount,
      0,
    ),
  };
}

function findBodyElements(
  document: DefaultTreeAdapterTypes.Document,
): HtmlElement[] {
  const bodies: HtmlElement[] = [];

  visitChildren(document, (element) => {
    if (element.tagName === "body" && element.namespaceURI === HTML_NAMESPACE) {
      bodies.push(element);
    }
  }, true);

  return bodies;
}

function visitChildren(
  parent: DefaultTreeAdapterTypes.ParentNode,
  visit: (element: HtmlElement) => void,
  includeDescendants: boolean,
): void {
  for (const child of parent.childNodes) {
    if (!isElement(child)) continue;
    if (child.tagName.toLowerCase() === "template") continue;
    visit(child);
    if (includeDescendants) visitChildren(child, visit, true);
  }
}

function visitElement(
  element: HtmlElement,
  source: string,
  file: string,
  positions: SourcePositionIndex,
  insertions: Insertion[],
  diagnostics: HtmlIdentityDiagnostic[],
): void {
  if (element.namespaceURI !== HTML_NAMESPACE) return;

  const tagName = element.tagName.toLowerCase();
  if (EXCLUDED_TAG_NAMES.has(tagName) || hasAttribute(element, "id", NUDGE_UI_MOUNT_ID)) {
    return;
  }

  const location = element.sourceCodeLocation;
  const startTag = location?.startTag;
  if (!startTag) {
    diagnostics.push({
      code: "missing-source-location",
      severity: "warning",
      message: `Skipped <${tagName}> because the parser did not provide an opening-tag location.`,
      file,
      line: location?.startLine,
      column: location?.startCol,
      offset: location?.startOffset,
    });
  } else {
    const insertion = buildInsertion(source, file, element, startTag, positions, diagnostics);
    if (insertion) insertions.push(insertion);
  }

  for (const child of element.childNodes) {
    if (isElement(child)) {
      visitElement(child, source, file, positions, insertions, diagnostics);
    }
  }
}

function buildInsertion(
  source: string,
  file: string,
  element: HtmlElement,
  startTag: StartTagLocation,
  positions: SourcePositionIndex,
  diagnostics: HtmlIdentityDiagnostic[],
): Insertion | null {
  const location = element.sourceCodeLocation;
  const startOffset = location?.startOffset ?? startTag.startOffset;
  const { line: startLine, column: startColumn } = positionAt(positions, startOffset);
  const insertionOffset = getInsertionOffset(source, startTag);

  if (insertionOffset === null) {
    diagnostics.push({
      code: "invalid-source-location",
      severity: "warning",
      message: `Skipped <${element.tagName}> because its opening-tag location does not end at a tag boundary.`,
      file,
      line: startLine,
      column: startColumn,
      offset: startOffset,
    });
    return null;
  }

  const attributes: string[] = [];
  if (!hasAttribute(element, "data-cid")) {
    attributes.push(`data-cid="${escapeAttributeValue(`html:${element.tagName}`)}"`);
  }
  if (!hasAttribute(element, "data-src")) {
    attributes.push(
      `data-src="${escapeAttributeValue(`${file}:${startLine}:${startColumn}`)}"`,
    );
  }

  if (attributes.length === 0) return null;
  return {
    offset: insertionOffset,
    text: ` ${attributes.join(" ")}`,
    attributeCount: attributes.length,
  };
}

function getInsertionOffset(source: string, startTag: NonNullable<StartTagLocation>): number | null {
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

function applyInsertions(source: string, insertions: readonly Insertion[]): string {
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
 * lines from the parser risks drift from the bytes this module promises to
 * preserve. Offsets reference the original source, so positions are computed
 * from them directly, treating `\n`, `\r\n`, and lone `\r` as line breaks the
 * same way the HTML preprocessing specification does.
 *
 * Columns count UTF-16 code units from the line start: one column per tab,
 * matching grep-style tooling rather than editor tab stops.
 */
interface SourcePositionIndex {
  /** Zero-based source offset of every line's first character. */
  readonly lineStarts: readonly number[];
}

function createSourcePositionIndex(source: string): SourcePositionIndex {
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
interface SourcePosition {
  readonly line: number;
  readonly column: number;
}

function positionAt(positions: SourcePositionIndex, offset: number): SourcePosition {
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

function hasAttribute(element: HtmlElement, name: string, value?: string): boolean {
  const attribute = element.attrs.find((candidate) => candidate.name === name);
  return attribute !== undefined && (value === undefined || attribute.value === value);
}

function isElement(node: DefaultTreeAdapterTypes.ChildNode): node is HtmlElement {
  return "tagName" in node && typeof node.tagName === "string";
}

function escapeAttributeValue(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
