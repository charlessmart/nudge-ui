import { computeSpecificityCore } from "./selectorSemantics.ts";
import { resolveNestedSelector } from "./nestedSelectors.ts";
import { adoptedStylesheetKey, STATE_PREVIEW_SHEET_ID, VALUE_PREVIEW_SHEET_ID } from "../../runtime/ownedStylesheets.ts";
import { INTERACTION_CURSOR_PROPERTY, SPACING_CURSOR_PROPERTY } from "../../ui/customCursors.ts";
import { isPageSurface } from "../../canvas/pageSurface.ts";
import type { AtRuleContext, MatchedRule, StyleDeclaration } from "../../../css/model/index.ts";

interface RuleSnapshot {
  revision: number;
  rules: MatchedRule[];
  layerOrder: ReadonlyMap<string, number>;
  inaccessible: boolean;
}

export interface DocumentRevisions {
  element: number;
  stylesheet: number;
}

interface DocumentResolutionSession {
  active: boolean;
  observer: MutationObserver | null;
  view: Window | null;
  resizeListener: (() => void) | null;
}

interface DocumentResolutionReference {
  session: DocumentResolutionSession;
  count: number;
}

const revisionRecords = new WeakMap<Document, DocumentRevisions>();
const ruleSnapshots = new WeakMap<Document, RuleSnapshot>();
/** Bumped when a page-owned stylesheet's walk could change without replacing its CSSStyleSheet object; inspector-owned writes leave it alone. */
const pageSheetEpochs = new WeakMap<Document, number>();

/** Changes whenever a page-owned stylesheet may have changed; unlike the stylesheet revision, the inspector's own previews leave it alone. */
export function pageStylesheetEpoch(doc: Document): number {
  documentRevisions(doc);
  return pageSheetEpochs.get(doc) ?? 0;
}

function bumpPageSheetEpoch(doc: Document): void {
  pageSheetEpochs.set(doc, (pageSheetEpochs.get(doc) ?? 0) + 1);
}
const documentResolutionSessions = new WeakMap<Document, DocumentResolutionSession>();
const documentResolutionReferences = new WeakMap<Document, DocumentResolutionReference>();

const registeredElements = new WeakSet<Element>();
/** The inspected elements themselves, whose content can reach them through `:has()` and `:empty`; their ancestors are only in `registeredElements`. */
const resolutionSubjects = new WeakSet<Element>();
const documentRevisionListeners = new WeakMap<Document, Set<(revisions: Readonly<DocumentRevisions>) => void>>();

function isCurrentDocumentResolutionSession(doc: Document, session: DocumentResolutionSession): boolean {
  return session.active && documentResolutionSessions.get(doc) === session;
}

function notifyDocumentRevision(doc: Document): void {
  const revisions = documentRevisions(doc);
  documentRevisionListeners.get(doc)?.forEach((cb) => cb({ ...revisions }));
}

export function subscribeDocumentRevision(
  doc: Document,
  cb: (revisions: Readonly<DocumentRevisions>) => void,
): () => void {
  let listeners = documentRevisionListeners.get(doc);
  if (!listeners) {
    listeners = new Set();
    documentRevisionListeners.set(doc, listeners);
  }
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && documentRevisionListeners.get(doc) === listeners) {
      documentRevisionListeners.delete(doc);
    }
  };
}

/** Only attribute mutations on registered elements bump the element revision; unrelated host churn is ignored. */
export function registerResolutionElement(el: Element): void {
  registeredElements.add(el);
}

export function registerResolutionLineage(element: HTMLElement): void {
  resolutionSubjects.add(element);
  let current: HTMLElement | null = element;
  while (current) {
    registerResolutionElement(current);
    current = current.parentElement;
  }
}

export function disposeDocumentResolution(doc: Document): void {
  const session = documentResolutionSessions.get(doc);
  if (session) {
    session.active = false;
    session.observer?.disconnect();
    if (session.view && session.resizeListener) {
      session.view.removeEventListener("resize", session.resizeListener);
    }
    session.observer = null;
    session.resizeListener = null;
    documentResolutionSessions.delete(doc);
  }
  documentResolutionReferences.delete(doc);

  // Counters stay monotonic: resetting to (0,0) would resurrect stale revision-keyed caches written before disposal.
  if (session) {
    const record = revisionRecords.get(doc);
    if (record) {
      record.element += 1;
      record.stylesheet += 1;
    }
  }
  ruleSnapshots.delete(doc);
  bumpPageSheetEpoch(doc);
  documentRevisionListeners.get(doc)?.clear();
  documentRevisionListeners.delete(doc);
}

export function retainDocumentResolution(doc: Document): () => void {
  documentRevisions(doc);
  const session = documentResolutionSessions.get(doc);
  if (!session) return () => undefined;

  const existing = documentResolutionReferences.get(doc);
  const reference = existing?.session === session
    ? existing
    : { session, count: 0 };
  reference.count += 1;
  documentResolutionReferences.set(doc, reference);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = documentResolutionReferences.get(doc);
    if (!current || current.session !== session) return;
    current.count -= 1;
    if (current.count === 0) disposeDocumentResolution(doc);
  };
}

function isStylesheetNode(node: Node | null): boolean {
  if (!node || node.nodeType !== node.ELEMENT_NODE) return false;
  const tag = (node as Element).tagName.toLowerCase();
  return tag === "style" || tag === "link";
}

function containsStylesheetNode(node: Node): boolean {
  if (node.nodeType !== node.ELEMENT_NODE) return false;
  return isStylesheetNode(node) || (node as Element).querySelector("style, link") !== null;
}

function changesStylesheet(record: MutationRecord): boolean {
  if (record.type === "attributes") return isStylesheetNode(record.target);
  if (record.type === "characterData") return isStylesheetNode(record.target.parentElement);
  return isStylesheetNode(record.target)
    || Array.from(record.addedNodes).some(isStylesheetNode)
    || Array.from(record.removedNodes).some(isStylesheetNode);
}

function isProbeNode(node: Node): boolean {
  let current: Node | null = node;
  while (current && current.nodeType !== current.DOCUMENT_NODE) {
    if (current.nodeType === current.ELEMENT_NODE && (current as Element).hasAttribute("data-nudge-ui")) return true;
    current = current.parentNode;
  }
  return false;
}

const CONTAINER_PROBE_MARKER = /^data-container-probe-/;
const MANAGED_SHEET_ID = "nudge-ui-styles";

function isManagedStylesheetNode(node: Node | null): boolean {
  return isStylesheetNode(node) && (node as Element).id === MANAGED_SHEET_ID;
}

function isPageStylesheetNode(node: Node | null): boolean {
  return isStylesheetNode(node) && !isManagedStylesheetNode(node);
}

function changesPageStylesheet(record: MutationRecord): boolean {
  if (record.type === "attributes") return isPageStylesheetNode(record.target);
  if (record.type === "characterData") return isPageStylesheetNode(record.target.parentElement);
  return isPageStylesheetNode(record.target)
    || Array.from(record.addedNodes).some(isPageStylesheetNode)
    || Array.from(record.removedNodes).some(isPageStylesheetNode);
}

// The renderer rewrites these on hover and spacing drags; bumping the element revision would re-resolve the cascade per pointer move.
const RENDERER_INLINE_CURSOR_PROPERTIES = ["cursor", INTERACTION_CURSOR_PROPERTY, SPACING_CURSOR_PROPERTY];

function styleTextWithoutCursor(doc: Document, text: string | null): string {
  const scratch = doc.createElement("div");
  scratch.style.cssText = text ?? "";
  for (const property of RENDERER_INLINE_CURSOR_PROPERTIES) scratch.style.removeProperty(property);
  return scratch.style.cssText;
}

function isCursorOnlyStyleChange(target: Element, oldValue: string | null): boolean {
  const doc = target.ownerDocument;
  return styleTextWithoutCursor(doc, oldValue) === styleTextWithoutCursor(doc, target.getAttribute("style"));
}

function withinResolutionSubject(node: Node | null): boolean {
  for (let current = node instanceof Element ? node : node?.parentElement ?? null; current; current = current.parentElement) {
    if (resolutionSubjects.has(current)) return true;
  }
  return false;
}

function isProbeMutation(record: MutationRecord): boolean {
  if (record.type === "attributes") {
    const target = record.target as Element;
    // Stylesheet attributes change the rules even for unregistered elements, so check them before the registry fast path.
    if (isStylesheetNode(target)) {
      const name = record.attributeName ?? "";
      if (isManagedStylesheetNode(target)) return name !== "data-nudge-ui";
      return name.startsWith("data-nudge-ui");
    }
    const name = record.attributeName ?? "";
    // data-renderer-id is lookup metadata, not a cascade input; ignore it before the registry check.
    if (name === "data-renderer-id") return true;
    if (!registeredElements.has(target)) return true;
    return name.startsWith("data-nudge-ui")
      || CONTAINER_PROBE_MARKER.test(name)
      || (name === "style" && isCursorOnlyStyleChange(target, record.oldValue));
  }
  const pageSurface = isPageSurface();
  if (record.type === "characterData") {
    // On an arbitrary page, text that streams or counts up outside the inspected lineage never feeds the cascade unless it is stylesheet source.
    const parent = record.target.parentElement;
    if (pageSurface && !isStylesheetNode(parent) && !(parent && registeredElements.has(parent)) && !withinResolutionSubject(parent)) return true;
    return isProbeNode(record.target) && !isManagedStylesheetNode(record.target.parentElement);
  }
  if (isProbeNode(record.target) && !isManagedStylesheetNode(record.target)) return true;
  // Removed nodes are already disconnected, so check their own attributes instead of an ancestor chain.
  const nodes = [...record.addedNodes, ...record.removedNodes];
  if (nodes.some(isManagedStylesheetNode)) return false;
  if (nodes.length > 0 && nodes.every((node) =>
    node.nodeType === node.ELEMENT_NODE && (node as Element).hasAttribute("data-nudge-ui"))) return true;
  // Host adapters re-resolve on any structural change, which HMR and verification rely on. A page the user does not control churns constantly, and a selector reaches the selection through its lineage or its own content, so a change elsewhere matters only when it brings in a stylesheet.
  return pageSurface
    && !isStylesheetNode(record.target)
    && !registeredElements.has(record.target as Element)
    && !withinResolutionSubject(record.target)
    && !nodes.some(containsStylesheetNode);
}

export function documentRevisions(doc: Document): DocumentRevisions {
  let record = revisionRecords.get(doc);
  if (!record) {
    record = { element: 0, stylesheet: 0 };
    revisionRecords.set(doc, record);
  }
  // A disposed document keeps its record but loses its observer; recreate the session so mutations are not silently unobserved.
  if (documentResolutionSessions.get(doc)) return record;

  const session: DocumentResolutionSession = {
    active: true,
    observer: null,
    view: doc.defaultView,
    resizeListener: null,
  };
  documentResolutionSessions.set(doc, session);

  // Not every TypeScript Window declaration types MutationObserver; the local cast keeps the observer document-local.
  const viewWithObserver = session.view as ((Window & { MutationObserver?: typeof MutationObserver }) | null);
  const Observer = viewWithObserver?.MutationObserver
    ?? (typeof MutationObserver !== "undefined" ? MutationObserver : undefined);
  const root = doc.documentElement;
  if (Observer && root) {
    const observer = new Observer((records: MutationRecord[]) => {
      if (!isCurrentDocumentResolutionSession(doc, session)) return;
      const relevant = records.filter((entry: MutationRecord) => !isProbeMutation(entry));
      if (relevant.length === 0) return;
      record.element++;
      if (relevant.some(changesStylesheet)) record.stylesheet++;
      if (relevant.some(changesPageStylesheet)) bumpPageSheetEpoch(doc);
      notifyDocumentRevision(doc);
    });
    session.observer = observer;
    observer.observe(root, {
      attributes: true,
      attributeOldValue: true,
      childList: true,
      characterData: true,
      subtree: true,
    });

    const resizeListener = () => {
      if (!isCurrentDocumentResolutionSession(doc, session)) return;
      record.element++;
      record.stylesheet++;
      bumpPageSheetEpoch(doc);
      notifyDocumentRevision(doc);
    };
    session.resizeListener = resizeListener;
    session.view?.addEventListener("resize", resizeListener);
  }
  return record;
}

function stylesheetRevision(doc: Document): number {
  return documentRevisions(doc).stylesheet;
}

export function invalidateStyleResolutionCache(doc: Document = document): void {
  const record = documentRevisions(doc);
  record.element++;
  record.stylesheet++;
  ruleSnapshots.delete(doc);
  bumpPageSheetEpoch(doc);
  notifyDocumentRevision(doc);
}

/** Inspector-only invalidation; page sheets are re-read only if their objects changed. */
export function invalidateOwnedStyleResolution(doc: Document = document): void {
  const record = documentRevisions(doc);
  record.element++;
  record.stylesheet++;
  ruleSnapshots.delete(doc);
  notifyDocumentRevision(doc);
}

function isStyleRuleInDocument(rule: CSSRule, doc: Document): rule is CSSStyleRule {
  const StyleRule = doc.defaultView?.CSSStyleRule;
  if (StyleRule && rule instanceof StyleRule) return true;
  return rule.type === (doc.defaultView?.CSSRule.STYLE_RULE ?? 1)
    && "selectorText" in rule && "style" in rule;
}

/** Prefers the serialized declaration block; enumeration is a fallback because a shorthand can enumerate empty longhands. */
export function declarationsFromCssom(style: CSSStyleDeclaration): StyleDeclaration[] {
  const declarations = parseCssomDeclarations(style.cssText);
  const seen = new Set(declarations.map((declaration) => declaration.property));
  for (let index = 0; index < style.length; index++) {
    const property = typeof style.item === "function" ? style.item(index) : style[index] ?? "";
    if (!property || seen.has(property)) continue;
    const value = style.getPropertyValue(property);
    if (!value) continue;
    declarations.push({
      property,
      value,
      important: style.getPropertyPriority(property) === "important",
    });
  }
  return declarations;
}

function parseCssomDeclarations(cssText: string): StyleDeclaration[] {
  const declarations: StyleDeclaration[] = [];
  let start = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let quote: string | null = null;
  let escaped = false;

  const append = (part: string): void => {
    const colon = findTopLevelColon(part);
    if (colon < 0) return;
    const property = part.slice(0, colon).trim();
    let value = part.slice(colon + 1).trim();
    if (!property || !value) return;
    const important = /!\s*important\s*$/i.test(value);
    if (important) value = value.replace(/!\s*important\s*$/i, "").trim();
    declarations.push({ property, value, important });
  };

  for (let index = 0; index < cssText.length; index++) {
    const char = cssText[index]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") parenDepth++;
    else if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (char === "[") bracketDepth++;
    else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (char === "{") braceDepth++;
    else if (char === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (char === ";" && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      append(cssText.slice(start, index));
      start = index + 1;
    }
  }
  append(cssText.slice(start));
  return declarations;
}

function findTopLevelColon(value: string): number {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let index = 0; index < value.length; index++) {
    const char = value[index]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") parenDepth++;
    else if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (char === "[") bracketDepth++;
    else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (char === "{") braceDepth++;
    else if (char === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (char === ":" && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) return index;
  }
  return -1;
}

function atRuleParams(cssText: string, name: "media" | "container" | "supports"): string {
  const match = new RegExp(`^\\s*@${name}\\s+([\\s\\S]*?)\\s*\\{`, "i").exec(cssText);
  return match?.[1]?.trim() ?? "";
}

function contextForRule(
  cssText: string,
  record: { conditionText?: string; containerName?: string },
): AtRuleContext | null {
  if (/^\s*@media\b/i.test(cssText)) {
    const params = record.conditionText?.trim() || atRuleParams(cssText, "media");
    return params ? { kind: "media", params } : null;
  }
  if (/^\s*@container\b/i.test(cssText)) {
    // conditionText includes the container name in some engines and omits it in others; prepend only when missing.
    const containerName = record.containerName?.trim();
    const condition = record.conditionText?.trim() ?? "";
    const hasName = Boolean(containerName) && containerName !== "none";
    const conditionNamed = hasName && condition.startsWith(containerName!)
      && /^(?:$|[\s(])/.test(condition.slice(containerName!.length));
    const fromInterfaces = hasName && !conditionNamed ? `${containerName} ${condition}`.trim() : condition;
    const params = fromInterfaces || atRuleParams(cssText, "container");
    return params ? { kind: "container", params } : null;
  }
  if (/^\s*@supports\b/i.test(cssText)) {
    const params = record.conditionText?.trim() || atRuleParams(cssText, "supports");
    return params ? { kind: "supports", params } : null;
  }
  return null;
}

function isNestedDeclarations(rule: CSSRule, doc: Document): rule is CSSRule & { style: CSSStyleDeclaration } {
  if (isStyleRuleInDocument(rule, doc) || !("style" in rule) || "selectorText" in rule) return false;
  // Chromium's CSSNestedDeclarations is not yet in lib.dom; identify its declaration-only shape conservatively.
  return !/^\s*@/.test(rule.cssText ?? "") && typeof (rule as { style?: unknown }).style === "object";
}

type WalkedRule = Omit<MatchedRule, "source" | "sourceOrder" | "layerOrder">;
/** One sheet's walk, in order: a layer's first mention or a style rule. */
type WalkEvent = { layer: string } | { rule: WalkedRule };

interface SheetWalk {
  epoch: number;
  ruleCount: number;
  /** Media conditions the walk evaluated, with the answers it used. */
  media: ReadonlyMap<string, boolean>;
  events: WalkEvent[];
}

/** Page-owned walks survive inspector edits; walkStillValid() defines when one must be re-read. */
const pageSheetWalks = new WeakMap<CSSStyleSheet, SheetWalk>();

function walkStillValid(walk: SheetWalk, rules: CSSRuleList, epoch: number, view: Window | null): boolean {
  if (walk.epoch !== epoch || walk.ruleCount !== rules.length) return false;
  for (const [condition, matches] of walk.media) {
    if ((view ? view.matchMedia(condition).matches : false) !== matches) return false;
  }
  return true;
}

function walkSheet(rules: CSSRuleList, doc: Document): Pick<SheetWalk, "events" | "media"> {
  const events: WalkEvent[] = [];
  const media = new Map<string, boolean>();
  const view = doc.defaultView;
  const nestedLayerName = (parent: string | undefined, child: string): string | undefined => {
    const normalized = child.trim();
    if (!normalized) return parent;
    const name = parent ? `${parent}.${normalized}` : normalized;
    events.push({ layer: name });
    return name;
  };
  const mediaMatches = (condition: string): boolean => {
    let matches = media.get(condition);
    if (matches === undefined) {
      matches = view ? view.matchMedia(condition).matches : false;
      media.set(condition, matches);
    }
    return matches;
  };
  const walkRules = (
    rules: CSSRuleList,
    active = true,
    layer?: string,
    atRules: AtRuleContext[] = [],
    inheritedSelector?: string,
  ): void => {
    for (const rule of Array.from(rules)) {
      if (isStyleRuleInDocument(rule, doc)) {
        try {
          const selectorText = inheritedSelector
            ? resolveNestedSelector(rule.selectorText, inheritedSelector)
            : rule.selectorText;
          events.push({ rule: {
            selectorText,
            specificity: computeSpecificityCore(selectorText),
            declarations: declarationsFromCssom(rule.style),
            active,
            layer,
            atRules: atRules.length > 0 ? atRules : undefined,
          } });
          const nested = (rule as { cssRules?: CSSRuleList }).cssRules;
          if (nested?.length) walkRules(nested, active, layer, atRules, selectorText);
        } catch {
          continue;
        }
        continue;
      }
      // Serializing a style rule's declaration block is costly, so only other rule kinds are serialized to recognise their at-rule.
      const serializedRule = rule.cssText ?? "";
      const layerStatement = /^\s*@layer\s+([^;{]+)\s*;/i.exec(serializedRule);
      if (layerStatement && !("cssRules" in rule)) {
        layerStatement[1]!.split(",").forEach((name) => nestedLayerName(layer, name));
        continue;
      }
      if (isNestedDeclarations(rule, doc)) {
        if (!inheritedSelector) continue;
        try {
          events.push({ rule: {
            selectorText: inheritedSelector,
            specificity: computeSpecificityCore(inheritedSelector),
            declarations: declarationsFromCssom(rule.style),
            active,
            layer,
            atRules: atRules.length > 0 ? atRules : undefined,
          } });
        } catch {
          continue;
        }
      } else if ("cssRules" in rule) {
        try {
          const record = rule as {
            cssRules: CSSRuleList;
            conditionText?: string;
            containerName?: string;
            name?: string;
          };
          let childActive = active;
          const cssText = serializedRule;
          const isMedia = /^\s*@media\b/i.test(cssText);
          const isSupports = /^\s*@supports\b/i.test(cssText);
          const isLayer = /^\s*@layer\b/i.test(cssText);
          if (isMedia && record.conditionText) childActive = active && mediaMatches(record.conditionText);
          else if (isSupports && record.conditionText) childActive = active && (view?.CSS?.supports(record.conditionText) ?? false);
          // A container query depends on the styled element, so the walk only retains it; resolution evaluates it against the selection.
          const context = contextForRule(cssText, record);
          const childLayer = isLayer
            ? nestedLayerName(layer, record.name ?? cssText.slice(6, cssText.indexOf("{")).trim())
            : layer;
          walkRules(
            record.cssRules,
            childActive,
            childLayer,
            context ? [...atRules, context] : atRules,
            inheritedSelector,
          );
        } catch {
          continue;
        }
      }
    }
  };
  walkRules(rules);
  return { events, media };
}

export function collectRules(doc: Document) {
  const revision = stylesheetRevision(doc);
  const cached = ruleSnapshots.get(doc);
  if (cached?.revision === revision) {
    return {
      rules: cached.rules,
      layerOrder: cached.layerOrder,
      inaccessible: cached.inaccessible,
    };
  }

  const out: MatchedRule[] = [];
  const layerOrder = new Map<string, number>();
  let inaccessible = false;
  const epoch = pageSheetEpochs.get(doc) ?? 0;
  const append = (events: readonly WalkEvent[], source: string): void => {
    for (const event of events) {
      if ("layer" in event) {
        if (!layerOrder.has(event.layer)) layerOrder.set(event.layer, layerOrder.size);
        continue;
      }
      const { rule } = event;
      out.push({
        selectorText: rule.selectorText,
        specificity: rule.specificity,
        declarations: rule.declarations,
        source,
        sourceOrder: out.length,
        active: rule.active,
        layer: rule.layer,
        layerOrder: rule.layer ? layerOrder.get(rule.layer) : undefined,
        atRules: rule.atRules,
      });
    }
  };
  const sheetEvents = (sheet: CSSStyleSheet, pageOwned: boolean): readonly WalkEvent[] => {
    const rules = sheet.cssRules;
    if (!pageOwned) return walkSheet(rules, doc).events;
    const previous = pageSheetWalks.get(sheet);
    if (previous && walkStillValid(previous, rules, epoch, doc.defaultView)) return previous.events;
    const walk = { epoch, ruleCount: rules.length, ...walkSheet(rules, doc) };
    pageSheetWalks.set(sheet, walk);
    return walk.events;
  };

  const stylesheetNodes = Array.from(doc.querySelectorAll<HTMLElement>('style, link[rel~="stylesheet"]'));
  for (const [index, sheet] of Array.from(doc.styleSheets).entries()) {
    try {
      // jsdom does not currently expose CSSStyleSheet.ownerNode; the document stylesheet list and stylesheet element list retain the same order.
      const owner = (sheet.ownerNode as HTMLElement | null) ?? stylesheetNodes[index] ?? null;
      if (owner?.id === STATE_PREVIEW_SHEET_ID || owner?.id === VALUE_PREVIEW_SHEET_ID) continue;
      const source = owner?.dataset?.viteDevId
        ?? sheet.href
        ?? (owner?.id ? `#${owner.id}` : `stylesheet:${index + 1}`);
      const inspectorOwned = typeof owner?.hasAttribute === "function" && owner.hasAttribute("data-nudge-ui");
      append(sheetEvents(sheet, !inspectorOwned), source);
    } catch {
      inaccessible = true;
    }
  }
  // Adopted sheets cascade after document stylesheets. Under a strict style-src policy they also hold the inspector's own managed rules.
  for (const [index, sheet] of Array.from(doc.adoptedStyleSheets ?? []).entries()) {
    const key = adoptedStylesheetKey(doc, sheet);
    if (key === STATE_PREVIEW_SHEET_ID || key === VALUE_PREVIEW_SHEET_ID) continue;
    append(sheetEvents(sheet, key === null), key ? `#${key}` : `adopted:${index + 1}`);
  }
  const snapshot = { revision, rules: out, layerOrder, inaccessible };
  ruleSnapshots.set(doc, snapshot);
  return snapshot;
}

export function cascadeLayerOrder(doc: Document, name: string): number | undefined {
  return collectRules(doc).layerOrder.get(name);
}
