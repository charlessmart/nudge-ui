import { sourceSiteSelector } from "../selection/sourceSite.ts";
import { isNudgeUiDev } from "../runtime/devFlag.ts";
import {
  isTextContentChangeValue,
  isTextProjectionTargetValue,
  type TextContentChangeRecord,
  type TextProjectionTarget,
  type TextProjectionScope,
  type TextBindingEvidence,
} from "../inline-text/textChangeBoundary.ts";
import { isInteractionStylesInstalled } from "../overlay/interactionStyles.ts";

/** Strict JSON boundary guard for a text projection target. */
export const isTextProjectionTarget = isTextProjectionTargetValue;
export type { TextProjectionTarget } from "../inline-text/textChangeBoundary.ts";

/** Raw report shape at the renderer postMessage boundary. */
interface TextProjectionReportObject {
  readonly changeId?: unknown;
  readonly status?: unknown;
}

function isTextProjectionReportObject(value: unknown): value is TextProjectionReportObject {
  return typeof value === "object" && value !== null;
}

function hasOnlyKeys(value: TextProjectionReportObject, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export type TextProjectionStatus = "applied" | "missing" | "ambiguous" | "overridden";

export interface TextProjectionReport {
  changeId: string;
  status: TextProjectionStatus;
}

export interface TextContentProjectionDiagnostic extends TextProjectionReport {
  document: "Inspect" | `Canvas ${string}`;
  scope?: TextProjectionScope;
  evidence?: TextBindingEvidence;
}

/** Dedicated document-local marker; never part of canonical session identity. */
export const TEXT_PROJECTION_ATTR = "data-projection-text";

/** Inspector-owned hit target for a projected text node whose value is empty. */
export const EMPTY_TEXT_PROJECTION_ATTR = "data-empty-text";
/** Inspector-owned exact-node evidence paired with EMPTY_TEXT_PROJECTION_ATTR. */
export const EMPTY_TEXT_PROJECTION_PATH_ATTR = "data-empty-text-path";

const UNSAFE_TEXT_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "OPTION"]);
const UNSAFE_MIXED_DESCENDANT_TAGS = new Set([
  ...UNSAFE_TEXT_TAGS,
  "INPUT",
  "SELECT",
  "BUTTON",
  "A",
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "MARK",
  "CODE",
  "S",
  "DEL",
  "INS",
]);

interface AppliedTextProjection {
  change: TextContentChangeRecord;
  element: HTMLElement | null;
  status: TextProjectionStatus;
}

type TextProjectionMarkerMap = Map<string, string>;

const TEXT_PROJECTION_MARKER_MAP_PREFIX = "map:";

function isTextNode(node: Node | null | undefined): node is Text {
  return node?.nodeType === 3;
}

function markerKey(target: TextProjectionTarget): string {
  return target.textNodePath ? `path:${target.textNodePath.join(",")}` : "root";
}

function isEmptyTextAffordance(node: Node | null | undefined): node is HTMLElement {
  return node instanceof HTMLElement && node.hasAttribute(EMPTY_TEXT_PROJECTION_ATTR);
}

function hasInlineTextEditor(element: HTMLElement): boolean {
  return element.querySelector('[data-inline-editor="true"]') !== null;
}

function readProjectionMarkers(element: HTMLElement): TextProjectionMarkerMap {
  const raw = element.getAttribute(TEXT_PROJECTION_ATTR);
  if (!raw) return new Map();
  if (!raw.startsWith(TEXT_PROJECTION_MARKER_MAP_PREFIX)) {
    return new Map([["root", raw]]);
  }
  try {
    const parsed: unknown = JSON.parse(raw.slice(TEXT_PROJECTION_MARKER_MAP_PREFIX.length));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return new Map();
    return new Map(Object.entries(parsed).filter((entry): entry is [string, string] =>
      typeof entry[0] === "string" && typeof entry[1] === "string"));
  } catch {
    return new Map();
  }
}

function writeProjectionMarkers(element: HTMLElement, markers: TextProjectionMarkerMap): void {
  if (markers.size === 0) {
    element.removeAttribute(TEXT_PROJECTION_ATTR);
    return;
  }
  const singleRootId = markers.size === 1 ? markers.get("root") : undefined;
  if (singleRootId !== undefined && !singleRootId.startsWith(TEXT_PROJECTION_MARKER_MAP_PREFIX)) {
    element.setAttribute(TEXT_PROJECTION_ATTR, singleRootId);
    return;
  }
  const ordered = Object.fromEntries([...markers.entries()].sort(([a], [b]) => a.localeCompare(b)));
  element.setAttribute(
    TEXT_PROJECTION_ATTR,
    `${TEXT_PROJECTION_MARKER_MAP_PREFIX}${JSON.stringify(ordered)}`,
  );
}

function setProjectionMarker(element: HTMLElement, target: TextProjectionTarget, id: string): void {
  const markers = readProjectionMarkers(element);
  markers.set(markerKey(target), id);
  writeProjectionMarkers(element, markers);
}

function hasProjectionMarker(element: HTMLElement, target: TextProjectionTarget, id: string): boolean {
  return readProjectionMarkers(element).get(markerKey(target)) === id;
}

function removeProjectionMarker(element: HTMLElement, target: TextProjectionTarget, id: string): void {
  const markers = readProjectionMarkers(element);
  if (markers.get(markerKey(target)) !== id) return;
  markers.delete(markerKey(target));
  writeProjectionMarkers(element, markers);
}

interface DocumentProjectionState {
  applied: Map<string, AppliedTextProjection>;
  emptyAffordances: Map<string, HTMLElement>;
  snapshotKey: string | null;
  observer: MutationObserver | null;
  validationQueued: boolean;
}

interface CanvasReports {
  revision: number;
  reports: TextProjectionReport[];
}

export type TextProjectionResolution =
  | { status: "resolved"; element: HTMLElement }
  | { status: "missing" }
  | { status: "ambiguous" };

let canonicalChanges = new Map<string, TextContentChangeRecord>();
let documentStates = new Map<Document, DocumentProjectionState>();
let reportsByDocument = new WeakMap<Document, TextProjectionReport[]>();
let reportsByCanvasCard = new Map<string, CanvasReports>();
const diagnosticListeners = new Set<() => void>();
let diagnosticRevision = 0;

function normalizedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function textMatches(value: string, expected: string): boolean {
  return value === expected || normalizedText(value) === normalizedText(expected);
}

function textNodePath(root: HTMLElement, textNode: Text): number[] | null {
  if (!root.contains(textNode)) return null;
  const path: number[] = [];
  let current: Node = textNode;
  while (current !== root) {
    const parent = current.parentNode;
    if (!parent) return null;
    const index = Array.prototype.indexOf.call(parent.childNodes, current);
    if (index < 0) return null;
    path.unshift(index);
    current = parent;
  }
  return path;
}

function nodeAtPath(root: HTMLElement, path: readonly number[]): Node | null {
  let current: Node = root;
  for (const index of path) {
    const child = current.childNodes[index];
    if (!child) return null;
    current = child;
  }
  return current;
}

/** Find the exact text node represented by a target, tolerating a changed
 * child path only when one bounded before/after text node remains unique. */
export function resolveTextProjectionTextNode(
  element: HTMLElement,
  target: Pick<TextProjectionTarget, "textNodePath"> & Partial<Pick<TextProjectionTarget, "beforeText">>,
  expectedText = target.beforeText,
): Text | null {
  if (target.textNodePath) {
    const atPath = nodeAtPath(element, target.textNodePath);
    if (isTextNode(atPath)
      && (expectedText === undefined || textMatches(atPath.nodeValue ?? "", expectedText))) {
      return atPath;
    }
  }
  const walker = element.ownerDocument.createTreeWalker(element, 0x4 /* NodeFilter.SHOW_TEXT */);
  const matches: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === 3
      && expectedText !== undefined
      && textMatches(node.nodeValue ?? "", expectedText)) {
      if (isTextNode(node)) matches.push(node);
    }
    node = walker.nextNode();
  }
  return matches.length === 1 ? matches[0]! : null;
}

function hasSafeMixedDescendants(element: HTMLElement): boolean {
  // <br> only controls line layout. The projection targets one exact text
  // node, so keeping the break while changing that node is safe; formatting
  // descendants below still reject a flattening text projection.
  for (const descendant of Array.from(element.querySelectorAll<HTMLElement>("*"))) {
    if (UNSAFE_MIXED_DESCENDANT_TAGS.has(descendant.tagName)) return false;
    const editingHost = descendant.closest<HTMLElement>("[contenteditable]");
    if (editingHost
      && editingHost.getAttribute("data-inline-editor") !== "true"
      && editingHost.getAttribute("contenteditable") !== "false") return false;
  }
  return true;
}

function textHostIsSafe(
  element: HTMLElement,
  allowEmpty = false,
  target?: Pick<TextProjectionTarget, "textNodePath"> & Partial<Pick<TextProjectionTarget, "beforeText">>,
): boolean {
  if (UNSAFE_TEXT_TAGS.has(element.tagName)) return false;
  const editingHost = element.closest<HTMLElement>("[contenteditable]");
  if (editingHost
    && editingHost.getAttribute("data-inline-editor") !== "true"
    && editingHost.getAttribute("contenteditable") !== "false") return false;
  if (allowEmpty && element.childNodes.length === 0) return true;
  if (target?.textNodePath) {
    const textNode = nodeAtPath(element, target.textNodePath)
      ?? resolveTextProjectionTextNode(element, target);
    return Boolean(textNode
      && textNode.nodeType === 3
      && (allowEmpty || textNode.nodeValue?.length)
      && hasSafeMixedDescendants(element));
  }
  // An empty-text affordance is inspector-owned and deliberately sits beside
  // the retained empty Text node. Ignore it when proving that a direct leaf
  // remains safe; otherwise the affordance would invalidate its own target.
  const applicationChildren = Array.from(element.children)
    .filter((child) => !isEmptyTextAffordance(child)
      && child.getAttribute("data-inline-editor") !== "true");
  if (applicationChildren.length > 0) return false;
  const textNodes = Array.from(element.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE);
  if (textNodes.length === 1) {
    return allowEmpty || Boolean(textNodes[0]?.nodeValue?.length);
  }
  // The temporary inline editor wraps the retained direct Text node. Treat
  // that inspector-owned wrapper as transparent while validating the
  // canonical projection; otherwise its insertion would self-report as an
  // application reconciliation and remove the re-entry slot mid-session.
  const editingHosts = Array.from(element.children)
    .filter((child) => child.getAttribute("data-inline-editor") === "true");
  // The browser may split/replace the retained empty Text node while the
  // native editor receives its first input. The wrapper is still inspector
  // owned; its plain-text input guards are responsible for rejecting rich or
  // paragraph edits, so validation must not cancel the session on that
  // transient child shape.
  return editingHosts.length === 1;
}

function sourceCandidates(doc: Document, sourceSite: TextProjectionTarget["sourceSite"]): HTMLElement[] {
  const selector = sourceSiteSelector(sourceSite.cid, sourceSite.src);
  if (!selector) return [];
  try {
    return Array.from(doc.querySelectorAll<HTMLElement>(selector));
  } catch {
    return [];
  }
}

function evidenceMatches(element: HTMLElement, target: TextProjectionTarget, expectedText: string): boolean {
  const textNode = resolveTextProjectionTextNode(element, target, expectedText);
  return textHostIsSafe(element, expectedText.length === 0, target)
    && element.getAttribute("data-cprops") === target.props
    && element.getAttribute("aria-label") === target.ariaLabel
    && (Boolean(textNode)
      || (expectedText.length === 0
        && target.textNodePath === undefined
        && (element.textContent ?? "") === ""));
}

/** Capture stable source/evidence identity without retaining a DOM reference. */
export function captureTextProjectionTarget(
  element: HTMLElement,
  beforeText = element.textContent ?? "",
  selectedTextNode?: Text,
): TextProjectionTarget | null {
  if (!element.isConnected) return null;
  const textNode = selectedTextNode
    ?? (element.children.length === 0
      ? Array.from(element.childNodes).find((node): node is Text => node.nodeType === 3)
      : null);
  const path = textNode ? textNodePath(element, textNode) : null;
  const pathTarget = path && element.children.length > 0 ? { textNodePath: path } : undefined;
  if (!textHostIsSafe(element, false, pathTarget)) return null;
  const cid = element.getAttribute("data-cid") ?? "";
  const src = element.getAttribute("data-src") ?? "";
  if (!cid || !src) return null;
  const sourceSite = { cid, src };
  const occurrence = sourceCandidates(element.ownerDocument, sourceSite).indexOf(element);
  if (occurrence < 0) return null;
  return {
    sourceSite,
    occurrence,
    props: element.getAttribute("data-cprops"),
    ariaLabel: element.getAttribute("aria-label"),
    beforeText,
    ...pathTarget,
  };
}

/**
 * Resolve against source identity and bounded evidence. Occurrence is kept as
 * presentation metadata only and is never used to choose among identical
 * repeated outputs.
 */
export function resolveTextProjectionTarget(
  doc: Document,
  target: TextProjectionTarget,
  afterText?: string,
): TextProjectionResolution {
  const candidates = sourceCandidates(doc, target.sourceSite);
  const evidence = candidates.filter((element) =>
    evidenceMatches(element, target, target.beforeText)
    || (afterText !== undefined && evidenceMatches(element, target, afterText)));
  if (evidence.length === 0) return { status: "missing" };
  if (evidence.length !== 1) return { status: "ambiguous" };
  return { status: "resolved", element: evidence[0]! };
}

export function textProjectionSelector(target: TextProjectionTarget): string | null {
  return sourceSiteSelector(target.sourceSite.cid, target.sourceSite.src);
}

export function collectTextContentChanges(changes: ReadonlyArray<unknown>): TextContentChangeRecord[] {
  return changes.filter(isTextContentChangeValue).map((change) => ({
    ...change,
    target: {
      sourceSite: { ...change.target.sourceSite },
      occurrence: change.target.occurrence,
      props: change.target.props,
      ariaLabel: change.target.ariaLabel,
      beforeText: change.target.beforeText,
      ...(change.target.textNodePath
        ? { textNodePath: [...change.target.textNodePath] }
        : {}),
    },
    source: { ...change.source },
  }));
}

function removeEmptyTextAffordance(
  state: DocumentProjectionState,
  changeId: string,
): void {
  const affordance = state.emptyAffordances.get(changeId);
  if (affordance) affordance.remove();
  state.emptyAffordances.delete(changeId);
}

function emptyTextAffordanceFor(
  doc: Document,
  state: DocumentProjectionState,
  change: TextContentChangeRecord,
  element: HTMLElement,
): HTMLElement | null {
  const textNode = resolveTextProjectionTextNode(element, change.target, "");
  if (!textNode || textNode.nodeValue !== "") return null;
  const parent = textNode.parentNode;
  if (!(parent instanceof HTMLElement)) return null;

  const path = markerKey(change.target);
  // During re-entry the temporary editor wraps the empty Text node. The
  // existing slot remains beside that wrapper; search the whole projected
  // root before creating another slot inside the editing host.
  const existing = Array.from(element.querySelectorAll<HTMLElement>(`[${EMPTY_TEXT_PROJECTION_ATTR}]`))
    .find((child) => child.getAttribute(EMPTY_TEXT_PROJECTION_ATTR) === change.id
      && child.getAttribute(EMPTY_TEXT_PROJECTION_PATH_ATTR) === path);
  if (existing) {
    existing.hidden = !isInteractionStylesInstalled(doc);
    state.emptyAffordances.set(change.id, existing);
    return existing;
  }

  const affordance = doc.createElement("span");
  affordance.setAttribute(EMPTY_TEXT_PROJECTION_ATTR, change.id);
  affordance.setAttribute(EMPTY_TEXT_PROJECTION_PATH_ATTR, path);
  affordance.setAttribute("aria-hidden", "true");
  affordance.setAttribute("role", "presentation");
  affordance.setAttribute("contenteditable", "false");
  affordance.tabIndex = -1;
  // It has no application text and is never a source identity. The
  // interaction stylesheet supplies its visible, borderless hit geometry.
  affordance.hidden = !isInteractionStylesInstalled(doc);
  parent.insertBefore(affordance, textNode.nextSibling);
  state.emptyAffordances.set(change.id, affordance);
  return affordance;
}

/**
 * Keep inspector-owned empty-text hit slots aligned with the canonical text
 * projection. Slots are colocated with the exact retained Text node, so they
 * do not replace application structure or alter the durable text path.
 */
function syncEmptyTextAffordances(
  doc: Document,
  state: DocumentProjectionState,
  changes: readonly TextContentChangeRecord[],
): void {
  const emptyChanges = new Map(
    changes.filter((change) => change.after.length === 0).map((change) => [change.id, change]),
  );

  const seen = new Set<string>();
  for (const marker of Array.from(doc.querySelectorAll<HTMLElement>(`[${EMPTY_TEXT_PROJECTION_ATTR}]`))) {
    const changeId = marker.getAttribute(EMPTY_TEXT_PROJECTION_ATTR);
    const change = changeId ? emptyChanges.get(changeId) : undefined;
    const applied = changeId ? state.applied.get(changeId) : undefined;
    const identity = changeId
      ? `${changeId}\u0000${marker.getAttribute(EMPTY_TEXT_PROJECTION_PATH_ATTR) ?? ""}`
      : "";
    const valid = Boolean(change
      && applied?.status === "applied"
      && applied.element?.isConnected
      && applied.element.contains(marker)
      && marker.getAttribute(EMPTY_TEXT_PROJECTION_PATH_ATTR) === markerKey(change.target));
    if (!valid || seen.has(identity)) {
      marker.remove();
      if (changeId) state.emptyAffordances.delete(changeId);
    } else {
      seen.add(identity);
    }
  }

  for (const [changeId, affordance] of state.emptyAffordances) {
    if (!emptyChanges.has(changeId) || !affordance.isConnected) {
      affordance.remove();
      state.emptyAffordances.delete(changeId);
    }
  }

  for (const change of emptyChanges.values()) {
    const applied = state.applied.get(change.id);
    if (applied?.status !== "applied" || !applied.element?.isConnected) continue;
    emptyTextAffordanceFor(doc, state, change, applied.element);
  }
}

/** Returns the canonical record represented by an inspector empty-text slot. */
export function getTextContentChangeById(changeId: string): TextContentChangeRecord | null {
  return canonicalChanges.get(changeId) ?? null;
}

function notifyDiagnostics(): void {
  diagnosticRevision += 1;
  for (const listener of diagnosticListeners) listener();
}

function sameReports(a: readonly TextProjectionReport[], b: readonly TextProjectionReport[]): boolean {
  return a.length === b.length && a.every((report, index) =>
    report.changeId === b[index]?.changeId && report.status === b[index]?.status);
}

function storeReports(doc: Document, reports: TextProjectionReport[]): void {
  const before = reportsByDocument.get(doc) ?? [];
  reportsByDocument.set(doc, reports);
  if (!sameReports(before, reports)) notifyDiagnostics();
}

function reportsForSnapshot(state: DocumentProjectionState, changes: readonly TextContentChangeRecord[]): TextProjectionReport[] {
  return changes.map((change) => ({
    changeId: change.id,
    status: state.applied.get(change.id)?.status ?? "missing",
  }));
}

function textProjectionIdentityMatches(
  element: HTMLElement,
  change: TextContentChangeRecord,
): boolean {
  return element.getAttribute("data-cid") === change.target.sourceSite.cid
    && element.getAttribute("data-src") === change.target.sourceSite.src
    && element.getAttribute("data-cprops") === change.target.props
    && element.getAttribute("aria-label") === change.target.ariaLabel;
}

function restoreAppliedProjection(applied: AppliedTextProjection): void {
  const element = applied.element;
  if (!element || !element.isConnected) return;
  if (!hasProjectionMarker(element, applied.change.target, applied.change.id)) return;
  // Never overwrite a newer application/reconciliation state during undo or
  // clear. The marker, identity evidence, and projected value must all still
  // belong to us; text alone is not proof after a source-site identity change.
  if (!textProjectionIdentityMatches(element, applied.change)) return;
  const textNode = resolveTextProjectionTextNode(element, applied.change.target, applied.change.after);
  if (!textHostIsSafe(element, applied.change.after.length === 0, applied.change.target)) return;
  if (textNode) {
    textNode.nodeValue = applied.change.before;
  } else if (applied.change.target.textNodePath === undefined
    && applied.change.after.length === 0
    && (element.textContent ?? "") === "") {
    element.textContent = applied.change.before;
  }
}

function validationStatus(applied: AppliedTextProjection): TextProjectionStatus {
  if (applied.status === "overridden") return "overridden";
  const element = applied.element;
  if (applied.status === "missing" || applied.status === "ambiguous") return applied.status;
  if (!element || !element.isConnected) return "overridden";
  if (!hasProjectionMarker(element, applied.change.target, applied.change.id)) return "overridden";
  const textNode = resolveTextProjectionTextNode(element, applied.change.target, applied.change.after);
  const directEmpty = applied.change.target.textNodePath === undefined
    && applied.change.after.length === 0
    && (element.textContent ?? "") === "";
  // While an empty projection is being reopened, the native editor owns a
  // draft value that intentionally differs from the canonical empty value.
  // Keep the projection applied until the editor restores its Text node and
  // appends the next canonical snapshot; otherwise removing the slot changes
  // the wrapper's ownership and cancels the draft mid-keystroke.
  const inlineDraft = hasInlineTextEditor(element);
  const identityValid = textProjectionIdentityMatches(element, applied.change);
  const safe = textHostIsSafe(element, applied.change.after.length === 0, applied.change.target);
  if (!identityValid || !safe || (!textNode && !directEmpty && !inlineDraft)) {
    return "overridden";
  }
  return "applied";
}

/**
 * A controller can hydrate before a lazy route has mounted its tracked roots.
 * Keep a missing/ambiguous record pending and retry only when the document
 * mutates; an overridden projection remains authoritative and is never
 * re-applied.
 */
function resolvePendingProjection(
  doc: Document,
  applied: AppliedTextProjection,
): TextProjectionStatus {
  if (applied.status !== "missing" && applied.status !== "ambiguous") {
    return validationStatus(applied);
  }
  const resolved = resolveTextProjectionTarget(doc, applied.change.target, applied.change.after);
  if (resolved.status !== "resolved") return resolved.status;
  const element = resolved.element;
  setProjectionMarker(element, applied.change.target, applied.change.id);
  const textNode = resolveTextProjectionTextNode(element, applied.change.target, applied.change.target.beforeText)
    ?? resolveTextProjectionTextNode(element, applied.change.target, applied.change.after);
  if (!textNode) {
    if (applied.change.target.textNodePath !== undefined) return "overridden";
    element.textContent = applied.change.after;
  } else {
    textNode.nodeValue = applied.change.after;
  }
  applied.element = element;
  return "applied";
}

function validateAppliedProjection(doc: Document, state: DocumentProjectionState): void {
  let changed = false;
  for (const applied of state.applied.values()) {
    const status = resolvePendingProjection(doc, applied);
    if (status !== applied.status) {
      applied.status = status;
      changed = true;
    }
  }
  syncEmptyTextAffordances(doc, state, [...canonicalChanges.values()]);
  if (changed) storeReports(doc, reportsForSnapshot(state, [...canonicalChanges.values()]));
}

function scheduleValidation(doc: Document, state: DocumentProjectionState): void {
  if (state.validationQueued || state.applied.size === 0) return;
  state.validationQueued = true;
  queueMicrotask(() => {
    state.validationQueued = false;
    validateAppliedProjection(doc, state);
  });
}

function getDocumentState(doc: Document): DocumentProjectionState {
  const existing = documentStates.get(doc);
  if (existing) return existing;
  const state: DocumentProjectionState = {
    applied: new Map(),
    emptyAffordances: new Map(),
    snapshotKey: null,
    observer: null,
    validationQueued: false,
  };
  const Observer = doc.defaultView?.MutationObserver;
  if (Observer && doc.documentElement) {
    state.observer = new Observer(() => scheduleValidation(doc, state));
    state.observer.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        "data-cid",
        "data-src",
        "data-cprops",
        "aria-label",
        TEXT_PROJECTION_ATTR,
        EMPTY_TEXT_PROJECTION_ATTR,
        EMPTY_TEXT_PROJECTION_PATH_ATTR,
      ],
    });
  }
  documentStates.set(doc, state);
  return state;
}

/** Apply one controller-owned text snapshot to a document adapter. */
export function applyTextContentProjection(
  doc: Document,
  changes: ReadonlyArray<TextContentChangeRecord>,
): TextProjectionReport[] {
  if (!isNudgeUiDev()) return [];
  const state = getDocumentState(doc);
  canonicalChanges = new Map(changes.map((change) => [change.id, change]));
  const key = JSON.stringify(changes);
  if (state.snapshotKey === key) {
    // Reconciliation can happen between controller snapshots. Validate before
    // reporting so a pending MutationObserver callback cannot leave a stale
    // "applied" result visible to the Changes Log.
    validateAppliedProjection(doc, state);
    const reports = reportsForSnapshot(state, changes);
    storeReports(doc, reports);
    return reports;
  }

  const previous = state.applied;
  const next = new Map<string, AppliedTextProjection>();
  const incomingIds = new Set(changes.map((change) => change.id));

  // Removing a canonical record is an explicit revert/clear. Restore only a
  // marker/value still owned by that record; every surviving record keeps its
  // current application status and must not be replayed merely because an
  // unrelated change altered the shared snapshot.
  for (const [id, applied] of previous) {
    if (incomingIds.has(id)) continue;
    removeEmptyTextAffordance(state, id);
    restoreAppliedProjection(applied);
    if (applied.element) removeProjectionMarker(applied.element, applied.change.target, id);
  }

  state.snapshotKey = key;

  for (const change of changes) {
    const existing = previous.get(change.id);
    if (existing && JSON.stringify(existing.change) === JSON.stringify(change)) {
      existing.status = resolvePendingProjection(doc, existing);
      next.set(change.id, existing);
      continue;
    }

    if (existing) {
      removeEmptyTextAffordance(state, change.id);
      restoreAppliedProjection(existing);
      if (existing.element) removeProjectionMarker(existing.element, existing.change.target, change.id);
    }

    const resolved = resolveTextProjectionTarget(doc, change.target, change.after);
    if (resolved.status !== "resolved") {
      next.set(change.id, { change, element: null, status: resolved.status });
      continue;
    }
    const element = resolved.element;
    setProjectionMarker(element, change.target, change.id);
    const textNode = resolveTextProjectionTextNode(element, change.target, change.before)
      ?? resolveTextProjectionTextNode(element, change.target, change.after);
    if (!textNode && (change.target.textNodePath !== undefined || change.after.length > 0)) {
      removeProjectionMarker(element, change.target, change.id);
      next.set(change.id, { change, element: null, status: "missing" });
      continue;
    }
    if (textNode) textNode.nodeValue = change.after;
    else element.textContent = change.after;
    next.set(change.id, { change, element, status: "applied" });
  }
  state.applied = next;
  syncEmptyTextAffordances(doc, state, changes);

  // Drop markers that do not belong to the current controller snapshot. This
  // also cleans a marker left by a previous runtime instance without touching
  // a surviving overridden projection in `next`.
  for (const marker of Array.from(doc.querySelectorAll<HTMLElement>(`[${TEXT_PROJECTION_ATTR}]`))) {
    const markers = readProjectionMarkers(marker);
    for (const [key, id] of markers) {
      const applied = next.get(id);
      if (!applied || markerKey(applied.change.target) !== key) markers.delete(key);
    }
    writeProjectionMarkers(marker, markers);
  }

  const reports = reportsForSnapshot(state, changes);
  storeReports(doc, reports);
  return reports;
}

export function getTextProjectionReports(doc: Document): readonly TextProjectionReport[] {
  return reportsByDocument.get(doc) ?? [];
}

export function subscribeTextProjectionDiagnostics(listener: () => void): () => void {
  diagnosticListeners.add(listener);
  return () => diagnosticListeners.delete(listener);
}

export function getTextProjectionDiagnosticRevision(): number {
  return diagnosticRevision;
}

export function recordCanvasTextProjectionReports(
  cardId: string,
  revision: number,
  reports: readonly TextProjectionReport[],
): void {
  if (!Number.isSafeInteger(revision) || revision < 0 || !reports.every(isTextProjectionReport)) return;
  const expected = new Set(canonicalChanges.keys());
  if (reports.length !== expected.size
    || new Set(reports.map((report) => report.changeId)).size !== reports.length
    || reports.some((report) => !expected.has(report.changeId))) return;
  const existing = reportsByCanvasCard.get(cardId);
  if (existing && revision < existing.revision) return;
  const next = reports.map((report) => ({ ...report }));
  if (existing && existing.revision === revision && sameReports(existing.reports, next)) return;
  reportsByCanvasCard.set(cardId, { revision, reports: next });
  notifyDiagnostics();
}

export function clearCanvasTextProjectionReports(cardId: string): void {
  if (!reportsByCanvasCard.delete(cardId)) return;
  notifyDiagnostics();
}

export function getTextContentChangeDiagnostics(changeId: string): TextContentProjectionDiagnostic[] {
  const diagnostics: TextContentProjectionDiagnostic[] = [];
  const change = canonicalChanges.get(changeId);
  const host = reportsByDocument.get(document)?.find((report) => report.changeId === changeId);
  if (host) diagnostics.push({
    ...host,
    document: "Inspect",
    scope: change?.scope,
    evidence: change?.evidence,
  });
  for (const [cardId, entry] of reportsByCanvasCard) {
    const report = entry.reports.find((candidate) => candidate.changeId === changeId);
    if (report) diagnostics.push({
      ...report,
      document: `Canvas ${cardId}`,
      scope: change?.scope,
      evidence: change?.evidence,
    });
  }
  return diagnostics;
}

export function isTextProjectionReport(value: unknown): value is TextProjectionReport {
  if (!isTextProjectionReportObject(value)
    || !hasOnlyKeys(value, ["changeId", "status"])) return false;
  const { changeId, status } = value;
  return typeof changeId === "string" && changeId.length > 0
    && (status === "applied" || status === "missing"
      || status === "ambiguous" || status === "overridden");
}

export function resetTextProjectionState(): void {
  for (const [doc, state] of documentStates) {
    state.observer?.disconnect();
    for (const affordance of state.emptyAffordances.values()) affordance.remove();
    for (const affordance of Array.from(doc.querySelectorAll<HTMLElement>(`[${EMPTY_TEXT_PROJECTION_ATTR}]`))) {
      affordance.remove();
    }
  }
  documentStates = new Map();
  canonicalChanges = new Map();
  reportsByDocument = new WeakMap();
  reportsByCanvasCard.clear();
  diagnosticRevision = 0;
}
