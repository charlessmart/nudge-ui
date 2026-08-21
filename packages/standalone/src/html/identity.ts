import { parse, type DefaultTreeAdapterTypes, type ParserError } from "parse5";

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const DEFAULT_MOUNT_ID = "design-tool-root";
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

/** Options for source-preserving HTML identity instrumentation. */
export interface HtmlIdentityInstrumentationOptions {
  /** The mount element ID reserved for Design Tool. */
  readonly mountId?: string;
}

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
 * @param options Instrumentation options.
 * @returns Transformed source and diagnostics from the parser or inserter.
 */
export function instrumentHtml(
  source: string,
  file: string,
  options: HtmlIdentityInstrumentationOptions = {},
): HtmlIdentityResult {
  const diagnostics: HtmlIdentityDiagnostic[] = [];
  const parseErrors: ParserError[] = [];
  const document = parse(source, {
    sourceCodeLocationInfo: true,
    onParseError: (error) => parseErrors.push(error),
  });

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
  const mountId = options.mountId ?? DEFAULT_MOUNT_ID;
  const bodyElements = findBodyElements(document);

  for (const body of bodyElements) {
    for (const child of body.childNodes) {
      if (isElement(child)) {
        visitElement(child, source, file, mountId, insertions, diagnostics);
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
    visit(child);
    if (includeDescendants) visitChildren(child, visit, true);
  }
}

function visitElement(
  element: HtmlElement,
  source: string,
  file: string,
  mountId: string,
  insertions: Insertion[],
  diagnostics: HtmlIdentityDiagnostic[],
): void {
  if (element.namespaceURI !== HTML_NAMESPACE) return;

  const tagName = element.tagName.toLowerCase();
  if (EXCLUDED_TAG_NAMES.has(tagName) || hasAttribute(element, "id", mountId)) {
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
    const insertion = buildInsertion(source, file, element, startTag, diagnostics);
    if (insertion) insertions.push(insertion);
  }

  for (const child of element.childNodes) {
    if (isElement(child)) {
      visitElement(child, source, file, mountId, insertions, diagnostics);
    }
  }
}

function buildInsertion(
  source: string,
  file: string,
  element: HtmlElement,
  startTag: StartTagLocation,
  diagnostics: HtmlIdentityDiagnostic[],
): Insertion | null {
  const location = element.sourceCodeLocation;
  const startLine = location?.startLine ?? startTag.startLine;
  const startColumn = location?.startCol ?? startTag.startCol;
  const startOffset = location?.startOffset ?? startTag.startOffset;
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
