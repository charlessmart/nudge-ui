/**
 * Source identity reserved for elements created by a static HTML page after
 * the server's source-preserving pass has completed.
 *
 * The value intentionally does not match `file:line:column`. It is a
 * document-local selector identity, not a claim about source location.
 */
export const RUNTIME_UNKNOWN_SOURCE_PREFIX = "design-tool:unknown:";
export const RUNTIME_ELEMENT_CID_PREFIX = "design-tool-runtime-";
/** Maximum length retained for any runtime DOM evidence field. */
export const RUNTIME_EVIDENCE_MAX_LENGTH = 120;

/** Bounds an untrusted runtime evidence string without changing its content. */
export function boundRuntimeEvidence(value: string | null): string | null {
  return value === null ? null : value.slice(0, RUNTIME_EVIDENCE_MAX_LENGTH);
}

/** Normalizes rendered text before it becomes durable runtime evidence. */
export function normalizeRuntimeText(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? boundRuntimeEvidence(normalized) : null;
}

/** Keeps a runtime tag suitable for the prompt's inline element notation. */
export function normalizeRuntimeTag(value: string): string {
  return boundRuntimeEvidence(value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "")) ?? "";
}

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const DOCUMENT_STRUCTURE_TAGS = new Set(["HTML", "HEAD", "BODY"]);
const EXCLUDED_SUBTREE_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "TEMPLATE",
  "NOSCRIPT",
]);

const runtimeCreatedElements = new WeakSet<Element>();

/** Returns true for the source values generated for runtime DOM. */
export function isRuntimeGeneratedSource(src: string | null | undefined): boolean {
  return typeof src === "string" && src.startsWith(RUNTIME_UNKNOWN_SOURCE_PREFIX);
}

/** Returns whether this document-local element received generated identity. */
export function isRuntimeCreatedElement(element: Element | null | undefined): boolean {
  return element !== null && element !== undefined && runtimeCreatedElements.has(element);
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

function isEligibleElement(element: Element): element is HTMLElement {
  if (element.namespaceURI !== HTML_NAMESPACE) return false;
  if (DOCUMENT_STRUCTURE_TAGS.has(element.tagName)) return false;
  let current: Element | null = element;
  while (current) {
    if (current.namespaceURI !== HTML_NAMESPACE) return false;
    if (EXCLUDED_SUBTREE_TAGS.has(current.tagName)) return false;
    if (current.id === "design-tool-root") return false;
    current = current.parentElement;
  }
  return true;
}

function existingAttributeValues(doc: Document, name: string): Set<string> {
  return new Set(
    Array.from(doc.querySelectorAll(`[${name}]`))
      .map((element) => element.getAttribute(name))
      .filter((value): value is string => value !== null),
  );
}

/**
 * Installs document-local identity for eligible elements that a static HTML
 * application creates at runtime.
 *
 * The server owns source locations for the initial response. This Adapter
 * only fills missing attributes, observes added subtrees, and leaves the
 * author document untouched on disk. The returned function disconnects the
 * observer; generated attributes remain available to managed CSS until the
 * page is replaced.
 */
export function installStaticHtmlRuntimeIdentity(doc: Document = document): () => void {
  const usedCids = existingAttributeValues(doc, "data-cid");
  const usedSources = existingAttributeValues(doc, "data-src");
  let nextId = 1;
  let disposed = false;

  function nextIdentity(): { cid: string; src: string } {
    while (true) {
      const id = nextId++;
      const cid = `${RUNTIME_ELEMENT_CID_PREFIX}${id}`;
      const src = `${RUNTIME_UNKNOWN_SOURCE_PREFIX}${id}`;
      if (usedCids.has(cid) || usedSources.has(src)) continue;
      usedCids.add(cid);
      usedSources.add(src);
      return { cid, src };
    }
  }

  function ensureIdentity(element: Element): void {
    if (!isEligibleElement(element)) return;
    const needsCid = element.getAttribute("data-cid") === null;
    const needsSource = element.getAttribute("data-src") === null;
    if (!needsCid && !needsSource) return;

    const identity = nextIdentity();
    if (needsCid) element.setAttribute("data-cid", identity.cid);
    if (needsSource) element.setAttribute("data-src", identity.src);
    runtimeCreatedElements.add(element);
  }

  function scanSubtree(node: Node): void {
    if (disposed) return;
    if (isElement(node)) {
      ensureIdentity(node);
      for (const descendant of Array.from(node.querySelectorAll("*"))) {
        ensureIdentity(descendant);
      }
      return;
    }
    if (node.nodeType === 11) {
      for (const descendant of Array.from((node as DocumentFragment).querySelectorAll("*"))) {
        ensureIdentity(descendant);
      }
    }
  }

  const scanRoot = doc.body ?? doc.documentElement;
  if (scanRoot) scanSubtree(scanRoot);

  const MutationObserverConstructor = doc.defaultView?.MutationObserver ?? globalThis.MutationObserver;
  if (!MutationObserverConstructor || !doc.documentElement) {
    return () => {
      disposed = true;
    };
  }

  const observer = new MutationObserverConstructor((records) => {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) scanSubtree(node);
    }
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true });

  return () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
  };
}
