import {
  DESIGN_TOOL_CLIENT_PATH,
  DESIGN_TOOL_MANIFEST_PATH,
} from "../manifest.ts";
import { parse, type DefaultTreeAdapterTypes } from "parse5";

const DEFAULT_MOUNT_ID = "design-tool-root";
const CLIENT_MARKER = "data-design-tool-client";
const MOUNT_MARKER = "data-design-tool-mount";

/** Options for source-preserving standalone bootstrap injection. */
export interface StandaloneBootstrapOptions {
  /** The mount element ID used by the inspector. */
  readonly mountId?: string;
  /** The browser client URL. */
  readonly clientPath?: string;
  /** The runtime manifest URL passed to the browser client. */
  readonly manifestPath?: string;
}

/** The result of injecting the standalone bootstrap into one HTML response. */
export interface StandaloneBootstrapResult {
  /** The response source after any missing bootstrap nodes are inserted. */
  readonly html: string;
  /** Whether at least one node was inserted. */
  readonly injected: boolean;
}

/**
 * Adds the standalone mount and external client script to an HTML response.
 *
 * The function only inserts text at an existing HTML boundary. It does not
 * parse and reserialize the document, so authored bytes remain unchanged
 * except for the server-owned nodes. Marker checks make a second response
 * pass idempotent.
 *
 * @param html The transformed HTML response body.
 * @param options Bootstrap URLs and mount identity.
 * @returns The response body and whether anything was added.
 */
export function injectStandaloneBootstrap(
  html: string,
  options: StandaloneBootstrapOptions = {},
): StandaloneBootstrapResult {
  const mountId = options.mountId ?? DEFAULT_MOUNT_ID;
  const clientPath = options.clientPath ?? DESIGN_TOOL_CLIENT_PATH;
  const manifestPath = options.manifestPath ?? DESIGN_TOOL_MANIFEST_PATH;
  const document = parse(html, { sourceCodeLocationInfo: true });
  const sourceFacts = inspectSource(document, mountId, clientPath);
  const nodes: string[] = [];

  if (!sourceFacts.hasMount) {
    nodes.push(
      `<div id="${escapeAttributeValue(mountId)}" ${MOUNT_MARKER}></div>`,
    );
  }
  if (!sourceFacts.hasClient) {
    nodes.push(
      `<script type="module" src="${escapeAttributeValue(clientPath)}" ${CLIENT_MARKER} data-design-tool-manifest="${escapeAttributeValue(manifestPath)}"></script>`,
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
  mountId: string,
  clientPath: string,
): SourceFacts {
  const facts: SourceFacts = {
    hasMount: false,
    hasClient: false,
    bodyEndOffset: null,
    htmlEndOffset: null,
  };

  visitElements(document, (element) => {
    if (element.namespaceURI !== "http://www.w3.org/1999/xhtml") return;
    const tagName = element.tagName.toLowerCase();
    if (attributeValue(element, "id") === mountId) facts.hasMount = true;
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

  return facts;
}

function visitElements(
  parent: DefaultTreeAdapterTypes.ParentNode,
  visit: (element: HtmlElement) => void,
): void {
  for (const child of parent.childNodes) {
    if (!("tagName" in child) || typeof child.tagName !== "string") continue;
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
