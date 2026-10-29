import {
  NUDGE_UI_CLIENT_PATH,
  NUDGE_UI_MOUNT_ID,
  NUDGE_UI_MANIFEST_PATH,
} from "../manifest.ts";
import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { ANIMATION_CLOCK_SCRIPT } from "../../../inspector/canvas/animationClock.ts";

const CLIENT_MARKER = "data-nudge-ui-client";
const MOUNT_MARKER = "data-nudge-ui-mount";
const CLOCK_MARKER = "data-nudge-ui-clock";

export interface StandaloneBootstrapOptions {
  readonly clientPath?: string;
  readonly manifestPath?: string;
}

export interface StandaloneBootstrapResult {
  readonly html: string;
  readonly injected: boolean;
}

/** Inserts text at an existing boundary rather than reserializing, and marker checks make a second pass idempotent. */
export function injectStandaloneBootstrap(
  html: string,
  options: StandaloneBootstrapOptions = {},
): StandaloneBootstrapResult {
  const clientPath = options.clientPath ?? NUDGE_UI_CLIENT_PATH;
  const manifestPath = options.manifestPath ?? NUDGE_UI_MANIFEST_PATH;
  const document = parse(html, { sourceCodeLocationInfo: true });
  const sourceFacts = inspectSource(document, clientPath);
  const nodes: string[] = [];

  if (!sourceFacts.hasMount) {
    nodes.push(
      `<div id="${NUDGE_UI_MOUNT_ID}" ${MOUNT_MARKER}></div>`,
    );
  }
  if (!sourceFacts.hasClient) {
    nodes.push(
      `<script type="module" src="${escapeAttributeValue(clientPath)}" ${CLIENT_MARKER} data-nudge-ui-manifest="${escapeAttributeValue(manifestPath)}"></script>`,
    );
  }

  // First in the head, so animation libraries read the clock the Inspection tool can slow. A document without an
  // explicit head, html or body start tag has nowhere ahead of its scripts to put it.
  const clockOffset = sourceFacts.hasClock ? null : sourceFacts.headStartOffset;
  if (nodes.length === 0 && clockOffset === null) return { html, injected: false };

  const offset = sourceFacts.bodyEndOffset ?? sourceFacts.htmlEndOffset ?? html.length;
  const withBootstrap = nodes.length === 0
    ? html
    : `${html.slice(0, offset)}\n${nodes.join("\n")}\n${html.slice(offset)}`;
  // The head start precedes the bootstrap offset, so inserting the bootstrap first leaves it valid.
  return {
    html: clockOffset === null
      ? withBootstrap
      : `${withBootstrap.slice(0, clockOffset)}\n<script ${CLOCK_MARKER}>${ANIMATION_CLOCK_SCRIPT}</script>${withBootstrap.slice(clockOffset)}`,
    injected: true,
  };
}

interface SourceFacts {
  hasMount: boolean;
  hasClient: boolean;
  hasClock: boolean;
  /** Just after the head's start tag, or failing that the html or body start tag. */
  headStartOffset: number | null;
  bodyEndOffset: number | null;
  htmlEndOffset: number | null;
}

type HtmlElement = DefaultTreeAdapterTypes.Element;

function inspectSource(
  document: DefaultTreeAdapterTypes.Document,
  clientPath: string,
): SourceFacts {
  const facts: SourceFacts = {
    hasMount: false,
    hasClient: false,
    hasClock: false,
    headStartOffset: null,
    bodyEndOffset: null,
    htmlEndOffset: null,
  };

  let body: HtmlElement | null = null;
  const startOffsets = new Map<string, number>();
  visitElements(document, (element) => {
    if (element.namespaceURI !== "http://www.w3.org/1999/xhtml") return;
    const tagName = element.tagName.toLowerCase();
    if (tagName === "body") body = element;
    if (
      tagName === "script"
      && (attributeValue(element, CLIENT_MARKER) !== null
        || attributeValue(element, "src") === clientPath)
    ) {
      facts.hasClient = true;
    }
    if (tagName === "script" && attributeValue(element, CLOCK_MARKER) !== null) facts.hasClock = true;
    const startTagEnd = element.sourceCodeLocation?.startTag?.endOffset;
    if (startTagEnd !== undefined) startOffsets.set(tagName, startOffsets.get(tagName) ?? startTagEnd);
    const endOffset = element.sourceCodeLocation?.endTag?.startOffset;
    if (tagName === "body" && endOffset !== undefined) facts.bodyEndOffset = endOffset;
    if (tagName === "html" && endOffset !== undefined) facts.htmlEndOffset = endOffset;
  });

  facts.headStartOffset = startOffsets.get("head") ?? startOffsets.get("html") ?? startOffsets.get("body") ?? null;

  // Template content is inert, so only live body descendants can reserve the mount.
  if (body) {
    visitElements(body, (element) => {
      if (element !== body && attributeValue(element, "id") === NUDGE_UI_MOUNT_ID) {
        facts.hasMount = true;
      }
    });
  }

  return facts;
}

function visitElements(
  parent: DefaultTreeAdapterTypes.ParentNode,
  visit: (element: HtmlElement) => void,
): void {
  for (const child of parent.childNodes) {
    if (!("tagName" in child) || typeof child.tagName !== "string") continue;
    if (child.tagName.toLowerCase() === "template") continue;
    visit(child);
    visitElements(child, visit);
  }
}

function attributeValue(element: HtmlElement, name: string): string | null {
  return element.attrs.find((attribute) => attribute.name === name)?.value ?? null;
}

function escapeAttributeValue(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
