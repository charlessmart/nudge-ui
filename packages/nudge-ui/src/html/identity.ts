import { parse, type ParserError } from "parse5";
import path from "node:path";
import {
  EXCLUDED_TAG_NAMES,
  HTML_NAMESPACE,
  escapeAttributeValue,
  findBodyElements,
  getAttributeValue,
  hasAttribute,
  isElement,
  type HtmlElement,
} from "./dom.ts";
import {
  applyInsertions,
  createSourcePositionIndex,
  insertionOffsetFor,
  positionAt,
  type Insertion,
} from "./insertions.ts";
import { NUDGE_UI_MOUNT_ID } from "../transport/routes.ts";

/**
 * Adds source identity to HTML without reserializing it.
 *
 * Two hosts need this, and they differ only in where identity comes from.
 * The static-HTML host owns the file on disk, so it derives identity from
 * parser offsets. Astro does not own the rendered response, so it reads the
 * annotations Astro's own compiler emitted. Everything else — parsing,
 * traversal, eligibility, and byte-preserving insertion — is shared below.
 *
 * Only missing attributes are inserted, at the end of each opening tag, so
 * whitespace, quoting, entities, attribute order, and malformed input outside
 * those insertions remain byte-for-byte unchanged.
 */

/** A diagnostic emitted while parsing or instrumenting one HTML document. */
export interface HtmlIdentityDiagnostic {
  readonly code: HtmlIdentityDiagnosticCode;
  readonly severity: "warning";
  readonly message: string;
  /** The project-relative HTML file, when the operation instruments a file. */
  readonly file?: string;
  /** One-based source line, when a position is known. */
  readonly line?: number;
  /** One-based source column, when a position is known. */
  readonly column?: number;
  /** Zero-based source offset, when a position is known. */
  readonly offset?: number;
}

export type HtmlIdentityDiagnosticCode =
  | "html-parse-error"
  | "missing-source-location"
  | "invalid-source-location"
  | "astro-source-annotations-absent";

/** The result of instrumenting one document. */
export interface HtmlIdentityResult {
  /** The original source with identity attributes inserted at parser offsets. */
  readonly html: string;
  /** Parser and instrumentation diagnostics in source order, document-level last. */
  readonly diagnostics: readonly HtmlIdentityDiagnostic[];
  /** The number of attributes inserted into the returned source. */
  readonly insertedAttributeCount: number;
}

/** One eligible element, with its opening-tag position in the original source. */
interface ElementSite {
  readonly element: HtmlElement;
  readonly tagName: string;
  readonly line: number;
  readonly column: number;
  /** Zero-based offset of the element's start in the original source. */
  readonly offset: number;
}

/** How one host turns an eligible element into identity attributes. */
interface IdentityPass {
  /** Attribute source text to insert. An empty list skips the element. */
  attributesFor(site: ElementSite, report: ReportDiagnostic): string[];
  /** True when an element's subtree must not be visited. */
  stopsDescent?(tagName: string): boolean;
  /** Called for every eligible element before attributes are computed. */
  observe?(element: HtmlElement): void;
  /** Attached to every diagnostic, when the operation instruments a named file. */
  readonly file?: string;
}

type ReportDiagnostic = (
  code: HtmlIdentityDiagnosticCode,
  message: string,
  position?: { line?: number; column?: number; offset?: number },
) => void;

function runIdentityPass(source: string, pass: IdentityPass): HtmlIdentityResult {
  const diagnostics: HtmlIdentityDiagnostic[] = [];
  const report: ReportDiagnostic = (code, message, position) => {
    diagnostics.push({
      code,
      severity: "warning",
      message,
      ...(pass.file === undefined ? {} : { file: pass.file }),
      ...(position?.line === undefined ? {} : { line: position.line }),
      ...(position?.column === undefined ? {} : { column: position.column }),
      ...(position?.offset === undefined ? {} : { offset: position.offset }),
    });
  };

  const parseErrors: ParserError[] = [];
  const document = parse(source, {
    sourceCodeLocationInfo: true,
    onParseError: (error) => parseErrors.push(error),
  });

  for (const error of parseErrors) {
    // A missing doctype does not affect source locations or browser DOM
    // identity, so do not turn ordinary HTML fragments into warning-heavy
    // results. Other parser errors can affect the tree and are useful.
    if (error.code === "missing-doctype") continue;
    report("html-parse-error", `HTML parser reported ${error.code}.`, {
      line: error.startLine,
      column: error.startCol,
      offset: error.startOffset,
    });
  }

  const positions = createSourcePositionIndex(source);
  const insertions: Insertion[] = [];

  const visit = (element: HtmlElement): void => {
    if (element.namespaceURI !== HTML_NAMESPACE) return;

    const tagName = element.tagName.toLowerCase();
    if (EXCLUDED_TAG_NAMES.has(tagName)) return;
    if (hasAttribute(element, "id", NUDGE_UI_MOUNT_ID)) return;

    pass.observe?.(element);

    const location = element.sourceCodeLocation;
    const startTag = location?.startTag;
    if (!startTag) {
      report(
        "missing-source-location",
        `Skipped <${tagName}> because the parser did not provide an opening-tag location.`,
        { line: location?.startLine, column: location?.startCol, offset: location?.startOffset },
      );
    } else {
      const startOffset = location?.startOffset ?? startTag.startOffset;
      const { line, column } = positionAt(positions, startOffset);
      const offset = insertionOffsetFor(source, startTag);
      if (offset === null) {
        report(
          "invalid-source-location",
          `Skipped <${tagName}> because its opening-tag location does not end at a tag boundary.`,
          { line, column, offset: startOffset },
        );
      } else {
        const attributes = pass.attributesFor(
          { element, tagName, line, column, offset: startOffset },
          report,
        );
        if (attributes.length > 0) {
          insertions.push({
            offset,
            text: ` ${attributes.join(" ")}`,
            attributeCount: attributes.length,
          });
        }
      }
    }

    if (pass.stopsDescent?.(tagName)) return;
    for (const child of element.childNodes) {
      if (isElement(child)) visit(child);
    }
  };

  for (const body of findBodyElements(document)) {
    for (const child of body.childNodes) {
      if (isElement(child)) visit(child);
    }
  }

  return {
    html: insertions.length === 0 ? source : applyInsertions(source, insertions),
    diagnostics,
    insertedAttributeCount: insertions.reduce((count, i) => count + i.attributeCount, 0),
  };
}

/**
 * Instruments an HTML file the host owns on disk.
 *
 * Identity is derived from the file path and the parser's offsets, so every
 * eligible element receives both a label and an exact source position.
 *
 * @param source The HTML file contents.
 * @param file The project-relative file identity used in `data-src`.
 */
export function instrumentSourceHtml(source: string, file: string): HtmlIdentityResult {
  return runIdentityPass(source, {
    file,
    attributesFor({ element, line, column }) {
      const attributes: string[] = [];
      if (!hasAttribute(element, "data-cid")) {
        attributes.push(`data-cid="${escapeAttributeValue(`html:${element.tagName}`)}"`);
      }
      if (!hasAttribute(element, "data-src")) {
        attributes.push(`data-src="${escapeAttributeValue(`${file}:${line}:${column}`)}"`);
      }
      return attributes;
    },
  });
}

/** Astro's hydration host; its subtree receives framework-side identity later. */
const ASTRO_ISLAND_TAG_NAME = "astro-island";
const ASTRO_SOURCE_FILE_ATTRIBUTE = "data-astro-source-file";
const ASTRO_SOURCE_LOC_ATTRIBUTE = "data-astro-source-loc";

export interface RenderedHtmlIdentityOptions {
  /**
   * Project root used to make annotation file paths project-relative.
   * Absolute paths are relativized; relative paths pass through. When
   * omitted, annotation paths are forwarded unchanged.
   */
  readonly projectRoot?: string;
}

/**
 * Instruments a rendered Astro dev response the host does not own.
 *
 * Identity comes from Astro's compiler annotations. Elements without them
 * degrade to a generated `astro:<Tag>` label with no invented location,
 * because a `data-src` this operation guessed would be worse than none.
 */
export function instrumentRenderedHtml(
  html: string,
  options: RenderedHtmlIdentityOptions = {},
): HtmlIdentityResult {
  let sawSourceAnnotation = false;

  const result = runIdentityPass(html, {
    stopsDescent: (tagName) => tagName === ASTRO_ISLAND_TAG_NAME,
    observe(element) {
      if (hasAttribute(element, ASTRO_SOURCE_FILE_ATTRIBUTE)) sawSourceAnnotation = true;
    },
    attributesFor({ element, tagName, line, column, offset }, report) {
      const attributes: string[] = [];
      if (!hasAttribute(element, "data-cid")) {
        attributes.push(`data-cid="${escapeAttributeValue(astroLabel(tagName))}"`);
      }
      if (!hasAttribute(element, "data-src")) {
        const identity = readAstroSourceIdentity(element, options.projectRoot, report, {
          line,
          column,
          offset,
        });
        if (identity !== null) attributes.push(`data-src="${escapeAttributeValue(identity)}"`);
      }
      return attributes;
    },
  });

  if (result.insertedAttributeCount === 0 || sawSourceAnnotation) return result;

  return {
    ...result,
    diagnostics: [...result.diagnostics, {
      code: "astro-source-annotations-absent",
      severity: "warning",
      message:
        "No eligible element carried Astro dev source annotations, so identity is degraded to generated astro:<Tag> labels without data-src. Enable the Astro dev toolbar to restore exact source identity.",
    }],
  };
}

/**
 * Builds a `data-src` from Astro's annotations, or returns null when no
 * usable position exists. Never invents a location: an annotated file without
 * a readable position contributes nothing rather than a bare file path that
 * downstream consumers would misparse.
 */
function readAstroSourceIdentity(
  element: HtmlElement,
  projectRoot: string | undefined,
  report: ReportDiagnostic,
  position: { line: number; column: number; offset: number },
): string | null {
  const fileValue = getAttributeValue(element, ASTRO_SOURCE_FILE_ATTRIBUTE);
  if (fileValue === undefined) return null;

  const tagName = element.tagName.toLowerCase();
  const trimmedFile = fileValue.trim();
  if (trimmedFile === "") {
    // An empty annotation yields ":line:col", which consumers would misparse.
    report("invalid-source-location", `Ignored empty Astro source file annotation on <${tagName}>.`, position);
    return null;
  }

  const locValue = getAttributeValue(element, ASTRO_SOURCE_LOC_ATTRIBUTE);
  if (locValue === undefined) return null;

  const loc = parseAstroSourceLoc(locValue);
  if (loc === null) {
    report(
      "invalid-source-location",
      `Ignored unreadable Astro source location "${locValue}" on <${tagName}>.`,
      position,
    );
    return null;
  }

  const file = projectRelativePath(trimmedFile, projectRoot);
  return loc.column === undefined ? `${file}:${loc.line}` : `${file}:${loc.line}:${loc.column}`;
}

/**
 * Parses Astro's `data-astro-source-loc` value ("line:column"). A bare
 * integer is accepted defensively as a line number with no column; anything
 * else is unreadable and yields no position.
 */
function parseAstroSourceLoc(value: string): { line: number; column?: number } | null {
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
function projectRelativePath(filePath: string, projectRoot: string | undefined): string {
  const normalized = filePath.replaceAll("\\", "/");
  if (projectRoot === undefined || !path.isAbsolute(normalized)) return normalized;
  const relative = path.relative(projectRoot, normalized).replaceAll("\\", "/");
  return relative === "" ? "." : relative;
}

/**
 * Capitalizes the authored tag name into the generated label, e.g. h1 ->
 * astro:H1. The island hydration host reads `astro:Island` rather than the
 * awkward `astro:Astro-island`; prompts name this element often enough to
 * deserve a clean label.
 */
function astroLabel(tagName: string): string {
  if (tagName === ASTRO_ISLAND_TAG_NAME) return "astro:Island";
  return `astro:${tagName.charAt(0).toUpperCase()}${tagName.slice(1)}`;
}
