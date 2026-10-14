import {
  NUDGE_UI_CLIENT_PATH,
  NUDGE_UI_MOUNT_ID,
  NUDGE_UI_MANIFEST_PATH,
} from "../manifest.ts";
import { parse, type DefaultTreeAdapterTypes } from "parse5";

const CLIENT_MARKER = "data-nudge-ui-client";
const MOUNT_MARKER = "data-nudge-ui-mount";

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

  if (nodes.length === 0) return { html, injected: false };

  const injection = `\n${nodes.join("\n")}\n`;
  const offset = sourceFacts.bodyEndOffset ?? sourceFacts.htmlEndOffset ?? html.length;
  return {
    html: `${html.slice(0, offset)}${injection}${html.slice(offset)}`,
    injected: true,
  };
}

interface SourceFacts {
  hasMount: boolean;
  hasClient: boolean;
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
    bodyEndOffset: null,
    htmlEndOffset: null,
  };

  let body: HtmlElement | null = null;
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
    const endOffset = element.sourceCodeLocation?.endTag?.startOffset;
    if (tagName === "body" && endOffset !== undefined) facts.bodyEndOffset = endOffset;
    if (tagName === "html" && endOffset !== undefined) facts.htmlEndOffset = endOffset;
  });

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
