import { parse, type DefaultTreeAdapterTypes, type ParserError } from "parse5";
import path from "node:path";

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

/** Astro's hydration host; its subtree receives framework-side identity later. */
const ASTRO_ISLAND_TAG_NAME = "astro-island";

/** The reserved Nudge UI inspector mount; neither it nor its subtree is instrumented. */
const NUDGE_UI_MOUNT_ID = "nudge-ui-root";

const ASTRO_SOURCE_FILE_ATTRIBUTE = "data-astro-source-file";
const ASTRO_SOURCE_LOC_ATTRIBUTE = "data-astro-source-loc";

type HtmlElement = DefaultTreeAdapterTypes.Element;
type ElementLocation = NonNullable<HtmlElement["sourceCodeLocation"]>;
type StartTagLocation = NonNullable<ElementLocation["startTag"]>;

/** Options for instrumenting one rendered dev HTML response. */
export interface AstroIdentityOptions {
  /**
   * Project root used to make annotation file paths project-relative.
   * Absolute paths are relativized; relative paths pass through. When
   * omitted, annotation paths are forwarded unchanged.
   */
  readonly projectRoot?: string;
}

/**
 * A diagnostic emitted while parsing or instrumenting one HTML response.
 * Diagnostics describe an unnamed response, so they carry no file identity;
 * positions reference the response text itself when available.
 */
export interface AstroIdentityDiagnostic {
  /** Identifies the parser or instrumentation condition. */
  readonly code: AstroIdentityDiagnosticCode;
  /** The severity of the diagnostic. */
  readonly severity: "warning";
  /** A human-readable explanation. */
  readonly message: string;
  /** One-based source line within the response, when the parser supplied one. */
  readonly line?: number;
  /** One-based source column within the response, when the parser supplied one. */
  readonly column?: number;
  /** Zero-based source offset within the response, when the parser supplied one. */
  readonly offset?: number;
}

/** Codes that can be returned in the identity module's diagnostics. */
export type AstroIdentityDiagnosticCode =
  | "html-parse-error"
  | "missing-source-location"
  | "invalid-source-location"
  | "astro-source-annotations-absent";

/** The result of instrumenting one rendered dev HTML response. */
export interface AstroIdentityResult {
  /** The original source with identity attributes inserted at parser offsets. */
  readonly html: string;
  /** Parser and instrumentation diagnostics in source order, document-level warnings last. */
  readonly diagnostics: readonly AstroIdentityDiagnostic[];
  /** The number of attributes inserted into the returned source. */
  readonly insertedAttributeCount: number;
}

interface Insertion {
  readonly offset: number;
  readonly text: string;
  readonly attributeCount: number;
}

/** Mutable state shared while visiting one response's element tree. */
interface InstrumentationContext {
  readonly source: string;
  readonly projectRoot?: string;
  readonly insertions: Insertion[];
  readonly diagnostics: AstroIdentityDiagnostic[];
  /** Whether any eligible visited element carried an Astro source-file annotation. */
  sawSourceAnnotation: boolean;
}

/**
 * Adds Nudge UI identity to eligible elements of one rendered dev HTML
 * response without reserializing the document.
 *
 * Identity comes from Astro's own compiler annotations: elements annotated
 * with `data-astro-source-file` / `data-astro-source-loc` receive a
 * `data-src` of `<project-relative-file>:<line>:<column>`, and every other
 * eligible element degrades to a generated `astro:<Tag>` label with no
 * invented location. Only missing attributes are inserted at the end of each
 * opening tag, so whitespace, quoting, entities, attribute order, Astro's
 * original annotations, and malformed input outside those insertions remain
 * byte-for-byte unchanged.
 *
 * @param html The buffered dev HTML response body to inspect.
 * @param options Instrumentation options, such as the project root.
 * @returns Transformed source and diagnostics from the parser or inserter.
 */
export function instrumentAstroHtml(
  html: string,
  options: AstroIdentityOptions = {},
): AstroIdentityResult {
  const diagnostics: AstroIdentityDiagnostic[] = [];
  const parseErrors: ParserError[] = [];
  const document = parse(html, {
    sourceCodeLocationInfo: true,
    onParseError: (error) => parseErrors.push(error),
  });

  for (const error of parseErrors) {
    // A missing doctype does not affect source locations or browser DOM
    // identity, so do not turn ordinary HTML fragments into warning-heavy
    // results. Other parser errors can affect the tree and are useful to the
    // integration's diagnostics stream.
    if (error.code === "missing-doctype") continue;
    diagnostics.push({
      code: "html-parse-error",
      severity: "warning",
      message: `HTML parser reported ${error.code}.`,
      line: error.startLine,
      column: error.startCol,
      offset: error.startOffset,
    });
  }

  const context: InstrumentationContext = {
    source: html,
    projectRoot: options.projectRoot,
    insertions: [],
    diagnostics,
    sawSourceAnnotation: false,
  };

  for (const body of findBodyElements(document)) {
    for (const child of body.childNodes) {
      if (isElement(child)) visitElement(child, context);
    }
  }

  if (context.insertions.length > 0 && !context.sawSourceAnnotation) {
    diagnostics.push({
      code: "astro-source-annotations-absent",
      severity: "warning",
      message:
        "No eligible element carried Astro dev source annotations, so identity is degraded to generated astro:<Tag> labels without data-src. Enable the Astro dev toolbar to restore exact source identity.",
    });
  }

  if (context.insertions.length === 0) {
    return {
      html,
      diagnostics,
      insertedAttributeCount: 0,
    };
  }

  return {
    html: applyInsertions(html, context.insertions),
    diagnostics,
    insertedAttributeCount: context.insertions.reduce(
      (count, insertion) => count + insertion.attributeCount,
      0,
    ),
  };
}

function findBodyElements(
  document: DefaultTreeAdapterTypes.Document,
): HtmlElement[] {
  const bodies: HtmlElement[] = [];

  const visitChildren = (
    parent: DefaultTreeAdapterTypes.ParentNode,
    includeDescendants: boolean,
  ): void => {
    for (const child of parent.childNodes) {
      if (!isElement(child)) continue;
      if (child.tagName.toLowerCase() === "template") continue;
      if (child.tagName === "body" && child.namespaceURI === HTML_NAMESPACE) {
        bodies.push(child);
      }
      if (includeDescendants) visitChildren(child, true);
    }
  };

  visitChildren(document, true);
  return bodies;
}

function visitElement(
  element: HtmlElement,
  context: InstrumentationContext,
): void {
  if (element.namespaceURI !== HTML_NAMESPACE) return;

  const tagName = element.tagName.toLowerCase();
  if (EXCLUDED_TAG_NAMES.has(tagName)) return;
  if (hasAttribute(element, "id", NUDGE_UI_MOUNT_ID)) return;

  if (hasAttribute(element, ASTRO_SOURCE_FILE_ATTRIBUTE)) {
    context.sawSourceAnnotation = true;
  }

  insertIdentity(element, tagName, context);

  // Island internals receive framework-side identity in a later stage; only
  // the hydration host keeps its Astro-derived identity.
  if (tagName === ASTRO_ISLAND_TAG_NAME) return;

  for (const child of element.childNodes) {
    if (isElement(child)) visitElement(child, context);
  }
}

function insertIdentity(
  element: HtmlElement,
  tagName: string,
  context: InstrumentationContext,
): void {
  const location = element.sourceCodeLocation;
  const startTag = location?.startTag;
  if (!startTag) {
    context.diagnostics.push({
      code: "missing-source-location",
      severity: "warning",
      message: `Skipped <${tagName}> because the parser did not provide an opening-tag location.`,
      line: location?.startLine,
      column: location?.startCol,
      offset: location?.startOffset,
    });
    return;
  }

  const insertionOffset = getInsertionOffset(context.source, startTag);
  if (insertionOffset === null) {
    context.diagnostics.push({
      code: "invalid-source-location",
      severity: "warning",
      message: `Skipped <${tagName}> because its opening-tag location does not end at a tag boundary.`,
      line: startTag.startLine,
      column: startTag.startCol,
      offset: startTag.startOffset,
    });
    return;
  }

  const attributes: string[] = [];
  if (!hasAttribute(element, "data-cid")) {
    attributes.push(`data-cid="${escapeAttributeValue(astroCid(tagName))}"`);
  }
  if (!hasAttribute(element, "data-src")) {
    const sourceIdentity = readAstroSourceIdentity(
      element,
      context.projectRoot,
      context.diagnostics,
    );
    if (sourceIdentity !== null) {
      attributes.push(`data-src="${escapeAttributeValue(sourceIdentity)}"`);
    }
  }

  if (attributes.length === 0) return;
  context.insertions.push({
    offset: insertionOffset,
    text: ` ${attributes.join(" ")}`,
    attributeCount: attributes.length,
  });
}

/**
 * Builds a `data-src` value from Astro's compiler annotations, or returns
 * null when no usable position exists. Never invents a location: unannotated
 * elements degrade to their generated label only, and an annotated file
 * without a readable position contributes no value rather than a bare file
 * path that downstream consumers would misparse.
 */
function readAstroSourceIdentity(
  element: HtmlElement,
  projectRoot: string | undefined,
  diagnostics: AstroIdentityDiagnostic[],
): string | null {
  const fileValue = getAttributeValue(element, ASTRO_SOURCE_FILE_ATTRIBUTE);
  if (fileValue === undefined) return null;

  const trimmedFile = fileValue.trim();
  if (trimmedFile === "") {
    // An empty file annotation contributes a value downstream consumers
    // would misparse (`":line:col"`), so it degrades exactly like an
    // unreadable location.
    const emptyLocation = element.sourceCodeLocation;
    diagnostics.push({
      code: "invalid-source-location",
      severity: "warning",
      message: `Ignored empty Astro source file annotation on <${element.tagName.toLowerCase()}>.`,
      line: emptyLocation?.startLine,
      column: emptyLocation?.startCol,
      offset: emptyLocation?.startOffset,
    });
    return null;
  }

  const file = projectRelativePath(trimmedFile, projectRoot);

  const locValue = getAttributeValue(element, ASTRO_SOURCE_LOC_ATTRIBUTE);
  if (locValue === undefined) return null;

  const loc = parseAstroSourceLoc(locValue);
  if (loc === null) {
    const location = element.sourceCodeLocation;
    diagnostics.push({
      code: "invalid-source-location",
      severity: "warning",
      message: `Ignored unreadable Astro source location "${locValue}" on <${element.tagName.toLowerCase()}>.`,
      line: location?.startLine,
      column: location?.startCol,
      offset: location?.startOffset,
    });
    return null;
  }

  return loc.column === undefined
    ? `${file}:${loc.line}`
    : `${file}:${loc.line}:${loc.column}`;
}

/**
 * Parses Astro's `data-astro-source-loc` value ("line:column"). A bare
 * integer is accepted defensively as a line number with no column; anything
 * else is unreadable and yields no position.
 */
function parseAstroSourceLoc(
  value: string,
): { line: number; column?: number } | null {
  const match = /^\s*(\d+)(?:\s*:\s*(\d+))?\s*$/.exec(value);
  const lineText = match?.[1];
  if (lineText === undefined) return null;
  const columnText = match?.[2];
  const line = Number(lineText);
  if (columnText === undefined) return line >= 1 ? { line } : null;
  const column = Number(columnText);
  return line >= 1 && column >= 1 ? { line, column } : null;
}

/**
 * Makes an annotation path project-relative. Absolute paths are relativized
 * against the project root; relative paths pass through. Separators are
 * normalized to forward slashes so values stay portable across platforms.
 */
function projectRelativePath(
  filePath: string,
  projectRoot: string | undefined,
): string {
  const normalized = filePath.replaceAll("\\", "/");
  if (projectRoot === undefined || !path.isAbsolute(normalized)) {
    return normalized;
  }
  const relative = path.relative(projectRoot, normalized).replaceAll("\\", "/");
  return relative === "" ? "." : relative;
}

/**
 * Capitalizes the authored tag name into the generated label, e.g. h1 ->
 * astro:H1. The island hydration host reads `astro:Island` rather than the
 * awkward `astro:Astro-island`; prompts name this element often enough to
 * deserve a clean label.
 */
function astroCid(tagName: string): string {
  if (tagName === ASTRO_ISLAND_TAG_NAME) return "astro:Island";
  return `astro:${tagName.charAt(0).toUpperCase()}${tagName.slice(1)}`;
}

function getInsertionOffset(source: string, startTag: StartTagLocation): number | null {
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

function getAttributeValue(element: HtmlElement, name: string): string | undefined {
  return element.attrs.find((candidate) => candidate.name === name)?.value;
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
