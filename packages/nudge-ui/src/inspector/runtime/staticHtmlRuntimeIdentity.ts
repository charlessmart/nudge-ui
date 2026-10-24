/** Document-local identity for runtime-created elements; intentionally not a file:line:column source claim. */
export const RUNTIME_UNKNOWN_SOURCE_PREFIX = "nudge-ui:unknown:";
export const RUNTIME_ELEMENT_CID_PREFIX = "nudge-ui-runtime-";
export const RUNTIME_EVIDENCE_MAX_LENGTH = 120;

export function boundRuntimeEvidence(value: string | null): string | null {
  return value === null ? null : value.slice(0, RUNTIME_EVIDENCE_MAX_LENGTH);
}

const DOM_PATH_MAX_LENGTH = 240;
const DOM_PATH_MAX_DEPTH = 4;
const DOM_PATH_MAX_CLASSES = 3;
const TEST_ID_ATTRIBUTES = ["data-testid", "data-test", "data-qa"];

function domPathSegment(element: Element): string {
  let segment = element.localName;
  if (element.id) segment += `#${element.id}`;
  const testAttribute = TEST_ID_ATTRIBUTES.find((name) => element.hasAttribute(name));
  if (testAttribute) segment += `[${testAttribute}="${element.getAttribute(testAttribute)}"]`;
  const classes = Array.from(element.classList).slice(0, DOM_PATH_MAX_CLASSES);
  if (classes.length > 0) segment += `.${classes.join(".")}`;
  return segment;
}

/** Ancestor description so a prompt without source locations still carries searchable ids, classes, and test ids. */
export function runtimeDomPath(element: Element): string | null {
  const segments: string[] = [];
  let current: Element | null = element;
  while (current && segments.length < DOM_PATH_MAX_DEPTH && !DOCUMENT_STRUCTURE_TAGS.has(current.tagName)) {
    segments.unshift(domPathSegment(current));
    if (current.id) break;
    current = current.parentElement;
  }
  if (segments.length === 0) return null;
  const path = segments.join(" > ");
  return path.length > DOM_PATH_MAX_LENGTH ? `…${path.slice(-DOM_PATH_MAX_LENGTH)}` : path;
}

export function normalizeRuntimeText(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? boundRuntimeEvidence(normalized) : null;
}

export function normalizeRuntimeTag(value: string): string {
  return boundRuntimeEvidence(value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "")) ?? "";
}

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
/** Never pointer targets or structural edit targets; see `EXCLUDED_TAG_NAMES` and the page target. */
const DOCUMENT_STRUCTURE_TAGS = new Set(["HTML", "HEAD", "BODY"]);
const EXCLUDED_SUBTREE_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "TEMPLATE",
  "NOSCRIPT",
]);

const runtimeCreatedElements = new WeakSet<Element>();

export function isRuntimeGeneratedSource(src: string | null | undefined): boolean {
  return typeof src === "string" && src.startsWith(RUNTIME_UNKNOWN_SOURCE_PREFIX);
}

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
    if (current.id === "nudge-ui-root") return false;
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

/** Fills only missing identity attributes and observes added subtrees; the returned function disconnects the observer. */
export function installStaticHtmlRuntimeIdentity(doc: Document = document): () => void {
  const ensureIdentity = createIdentityAllocator(doc);
  let disposed = false;

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
      // SAFETY: nodeType 11 is DOCUMENT_FRAGMENT_NODE, so the node is a DocumentFragment by the DOM spec.
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

const LAZY_IDENTITY_EVENTS = ["pointerover", "pointerdown", "mousedown", "click", "dblclick"] as const;
const LAZY_DESCENDANT_DEPTH = 2;

/** Install before the inspector so its capture listeners run first. */
export function installLazyRuntimeIdentity(doc: Document = document): () => void {
  // Per-install scope keeps fresh identities distinct from saved ones, which `runtimeIdentityClaims` re-attaches by evidence.
  const ensureIdentity = createIdentityAllocator(doc, `${Math.random().toString(36).slice(2, 8)}-`);

  function tagDescendants(element: Element, depth: number): void {
    if (depth === 0) return;
    for (const child of Array.from(element.children)) {
      ensureIdentity(child);
      tagDescendants(child, depth - 1);
    }
  }

  function onPointer(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element) || !isEligibleElement(target)) return;
    for (let current: Element | null = target; current; current = current.parentElement) {
      // Ancestors of a tagged element were tagged with it.
      if (current.hasAttribute("data-cid") && current !== target) break;
      ensureIdentity(current);
    }
    tagDescendants(target, LAZY_DESCENDANT_DEPTH);
    if (target.parentElement) tagDescendants(target.parentElement, 1);
  }

  for (const type of LAZY_IDENTITY_EVENTS) doc.addEventListener(type, onPointer, true);
  return () => {
    for (const type of LAZY_IDENTITY_EVENTS) doc.removeEventListener(type, onPointer, true);
  };
}

function createIdentityAllocator(doc: Document, scope = ""): (element: Element) => void {
  const usedCids = existingAttributeValues(doc, "data-cid");
  const usedSources = existingAttributeValues(doc, "data-src");
  let nextId = 1;

  function nextIdentity(): { cid: string; src: string } {
    while (true) {
      const id = nextId++;
      const cid = `${RUNTIME_ELEMENT_CID_PREFIX}${scope}${id}`;
      const src = `${RUNTIME_UNKNOWN_SOURCE_PREFIX}${scope}${id}`;
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

  return ensureIdentity;
}
