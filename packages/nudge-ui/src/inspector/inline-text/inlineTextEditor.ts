import { useSyncExternalStore } from "react";
import { appendChange } from "../changes/changesLog.ts";
import { registerInlineTextClearHandler } from "./inlineTextLifecycle.ts";
import { isNudgeUiDev } from "../runtime/devFlag.ts";
import {
  initialTextEditDecision,
  chooseTextEditBinding,
  getTextEditScopeChoices,
  getTextEditBinding,
  prepareTextEditChange,
} from "./textEditChange.ts";
import {
  resolveTextBinding,
  type TextBindingChoice,
  type TextBindingCandidate,
  type TextEditBinding,
  type TextEditRejection,
} from "../componentSemantics/textBinding.ts";
import type { ChangeRecord } from "../changes/types.ts";
import type { TextProjectionScope } from "./textChangeBoundary.ts";
import {
  captureTextProjectionTarget,
  EMPTY_TEXT_PROJECTION_ATTR,
  EMPTY_TEXT_PROJECTION_PATH_ATTR,
  getTextContentChangeById,
  resolveTextProjectionTarget,
  resolveTextProjectionTextNode,
} from "../projection/textProjection.ts";

export type { TextEditBinding, TextEditRejection } from "../componentSemantics/textBinding.ts";
export type { TextBindingCandidate } from "../componentSemantics/textBinding.ts";

export interface InlineTextSession {
  readonly binding: TextEditBinding;
  readonly bindingChoices: readonly TextBindingChoice[];
  readonly selectedBindingIndex: number | null;
  readonly scope: TextProjectionScope;
  readonly scopeChoices: readonly TextProjectionScope[];
  readonly host: HTMLElement;
  readonly before: string;
  chooseBinding(index: number): void;
  chooseScope(scope: TextProjectionScope): void;
  commit(reason?: InlineTextSessionEndReason): ChangeRecord | null;
  cancel(reason?: InlineTextSessionEndReason): void;
}

export interface InlineTextEditor {
  begin(
    element: HTMLElement,
    point?: { x: number; y: number },
  ): InlineTextSession | TextEditRejection;
}

export type InlineTextInteractionDisposition =
  | "pass-through"
  | "stop-propagation"
  | "suppress";

export type InlineTextSessionEndReason =
  | "start"
  | "commit"
  | "cancel"
  | "blur"
  | "route-disposed"
  | "frame-disposed"
  | "app-reconciled"
  | "selection-removed"
  | "host-removed";

export type InlineTextInputRejectionReason =
  | "cross-host-range"
  | "rich-input"
  | "paragraph-input"
  | "multiline-paste"
  | "invalid-input-type"
  | "clipboard-unavailable"
  | "invalid-selection";

export interface InlineTextDiagnostic {
  kind: "inline-text";
  status: "started" | "committed" | "cancelled" | "rejected";
  reason: InlineTextSessionEndReason | InlineTextInputRejectionReason;
  before: string;
  after?: string;
}

const listeners = new Set<() => void>();
let activeSession: InlineTextSession | null = null;
let activeSessionDocument: Document | null = null;
let pendingEditIntent: InlineTextTargetIntent | null = null;
// This remains armed if blur replaces the DOM between the second pointer-down
// and dblclick; only the next handoff attempt or explicit teardown consumes it.
let handoffPointerArmed = false;
let pendingReplayScheduled = false;
let sessionRevision = 0;
let inlineTextDiagnostics: InlineTextDiagnostic[] = [];
const diagnosticListeners = new Set<() => void>();

function discardPendingInlineTextEdit(ownerDocument?: Document): void {
  if (!ownerDocument || pendingEditIntent?.ownerDocument === ownerDocument) {
    pendingEditIntent = null;
  }
  if (!pendingEditIntent) handoffPointerArmed = false;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  sessionRevision += 1;
  listeners.forEach((listener) => listener());
}

function notifyDiagnostics(): void {
  for (const listener of diagnosticListeners) listener();
}

function recordDiagnostic(diagnostic: InlineTextDiagnostic): void {
  inlineTextDiagnostics = [...inlineTextDiagnostics.slice(-31), diagnostic];
  notifyDiagnostics();
}

export function getInlineTextDiagnostics(): readonly InlineTextDiagnostic[] {
  return inlineTextDiagnostics;
}

export function getInlineTextDiagnostic(): InlineTextDiagnostic | null {
  return inlineTextDiagnostics[inlineTextDiagnostics.length - 1] ?? null;
}

export function subscribeInlineTextDiagnostics(listener: () => void): () => void {
  diagnosticListeners.add(listener);
  return () => diagnosticListeners.delete(listener);
}

export function getInlineTextSession(): InlineTextSession | null {
  return activeSession;
}

export function useInlineTextSession(): InlineTextSession | null {
  useSyncExternalStore(subscribe, () => sessionRevision, () => sessionRevision);
  return activeSession;
}

export function isInlineTextEditingActive(): boolean {
  return activeSession !== null;
}

export function cancelInlineTextEdit(): void {
  discardPendingInlineTextEdit();
  activeSession?.cancel("cancel");
}

/** End a session owned by a document/frame that is about to be disposed. */
export function disposeInlineTextEdit(
  reason: "frame-disposed" | "route-disposed" = "frame-disposed",
  ownerDocument?: Document,
): void {
  if (!ownerDocument) {
    discardPendingInlineTextEdit();
    activeSession?.cancel(reason);
    return;
  }
  discardPendingInlineTextEdit(ownerDocument);
  if (activeSessionDocument === ownerDocument) activeSession?.cancel(reason);
}

interface InlineTextTargetIntent {
  readonly ownerDocument: Document;
  readonly target: Element;
  readonly point: { x: number; y: number };
}

type ResolvedInlineTextEditIntent =
  | { kind: "element"; target: HTMLElement }
  | { kind: "empty-projection"; marker: HTMLElement };

function ownerHTMLElement(element: Element): HTMLElement | null {
  const OwnerHTMLElement = element.ownerDocument.defaultView?.HTMLElement;
  // SAFETY: The owning realm's HTMLElement constructor proves that this DOM
  // element satisfies the HTMLElement interface, including iframe elements.
  return OwnerHTMLElement && element instanceof OwnerHTMLElement
    ? element as HTMLElement
    : null;
}

function currentIntentTarget(intent: InlineTextTargetIntent): Element | null {
  const pointed = intent.ownerDocument.elementFromPoint?.(intent.point.x, intent.point.y) ?? null;
  if (pointed?.closest(`[${EMPTY_TEXT_PROJECTION_ATTR}]`)) return pointed;
  if (intent.target.isConnected) return intent.target;
  return pointed;
}

function resolveInlineTextEditIntent(
  intent: InlineTextTargetIntent,
): ResolvedInlineTextEditIntent | null {
  const eventTarget = currentIntentTarget(intent);
  if (!eventTarget) return null;
  const marker = eventTarget.closest(`[${EMPTY_TEXT_PROJECTION_ATTR}]`);
  if (marker) {
    const htmlMarker = ownerHTMLElement(marker);
    if (htmlMarker) return { kind: "empty-projection", marker: htmlMarker };
  }
  let current: Element | null = eventTarget;
  while (current) {
    const htmlElement = ownerHTMLElement(current);
    if (htmlElement?.hasAttribute("data-cid")) {
      return { kind: "element", target: htmlElement };
    }
    current = current.parentElement;
  }
  return null;
}

function beginInlineTextEditIntent(
  intent: InlineTextTargetIntent,
): InlineTextSession | TextEditRejection | null {
  const resolved = resolveInlineTextEditIntent(intent);
  if (!resolved) return null;
  return resolved.kind === "empty-projection"
    ? beginInlineTextEditFromEmptyProjection(resolved.marker)
    : beginInlineTextEdit(resolved.target, intent.point);
}

function drainPendingInlineTextEdit(): InlineTextSession | TextEditRejection | null {
  if (activeSession || !pendingEditIntent) return null;
  const intent = pendingEditIntent;
  pendingEditIntent = null;
  return beginInlineTextEditIntent(intent);
}

function schedulePendingInlineTextEdit(): void {
  if (!pendingEditIntent || pendingReplayScheduled) return;
  pendingReplayScheduled = true;
  queueMicrotask(() => {
    pendingReplayScheduled = false;
    drainPendingInlineTextEdit();
  });
}

/**
 * Request inline editing from a document gesture. This is the interaction
 * seam: it owns active-session handoff so gesture routers never discard a
 * valid target switch merely because another draft is settling.
 */
function requestInlineTextEdit(
  target: Element,
  point: { x: number; y: number },
): InlineTextInteractionDisposition {
  if (activeSession) {
    const hitTarget = target.ownerDocument.elementFromPoint?.(point.x, point.y);
    if (activeSession.host.contains(target)
      || (hitTarget && activeSession.host.contains(hitTarget))) {
      return "stop-propagation";
    }
  }
  const intent: InlineTextTargetIntent = {
    ownerDocument: target.ownerDocument,
    target,
    point,
  };
  if (!resolveInlineTextEditIntent(intent)) return activeSession ? "suppress" : "pass-through";
  if (!activeSession) {
    const result = beginInlineTextEditIntent(intent);
    return result && !("kind" in result) ? "suppress" : "pass-through";
  }

  pendingEditIntent = intent;
  activeSession.commit("blur");
  if (!activeSession) drainPendingInlineTextEdit();
  return "suppress";
}

export type InlineTextEditIntent =
  | {
    kind: "pointer-down";
    target: Element;
    point: { x: number; y: number };
    clickCount: number;
  }
  | {
    kind: "double-click";
    target: Element;
    point: { x: number; y: number };
  };

/**
 * Handle one native interaction while keeping session-transition policy
 * local. Pointer-down preserves double-click intent across the first click's
 * blur commit, even when canonical projection replaces the target DOM.
 */
export function handleInlineTextEditIntent(
  intent: InlineTextEditIntent,
): InlineTextInteractionDisposition {
  if (intent.kind === "double-click") {
    return requestInlineTextEdit(intent.target, intent.point);
  }
  if (intent.clickCount <= 1) {
    handoffPointerArmed = activeSession !== null;
    return activeSession ? "stop-propagation" : "pass-through";
  }
  if (!activeSession && !handoffPointerArmed) return "pass-through";
  handoffPointerArmed = false;
  return requestInlineTextEdit(intent.target, intent.point);
}

function isTextEditRejection(
  value: TextBindingCandidate | TextEditRejection,
): value is TextEditRejection {
  return "kind" in value && value.kind === "rejected";
}

interface SelectionSnapshot {
  ranges: Range[];
}

function captureSelection(doc: Document): SelectionSnapshot {
  const selection = doc.getSelection?.();
  if (!selection) return { ranges: [] };
  const ranges: Range[] = [];
  for (let index = 0; index < selection.rangeCount; index += 1) {
    ranges.push(selection.getRangeAt(index).cloneRange());
  }
  return { ranges };
}

function restoreSelection(doc: Document, snapshot: SelectionSnapshot): void {
  const selection = doc.getSelection?.();
  if (!selection) return;
  selection.removeAllRanges();
  for (const range of snapshot.ranges) {
    if (range.startContainer.isConnected && range.endContainer.isConnected) {
      try {
        selection.addRange(range);
      } catch {
        // A framework rerender can invalidate a saved range between cleanup
        // and restoration. Removing the transient selection is safer than
        // retaining a range in a detached editing wrapper.
        selection.removeAllRanges();
      }
    }
  }
}

interface HostOwnership {
  parent: Node;
  nextSibling: ChildNode | null;
}

function hostIsOwned(
  candidate: TextBindingCandidate,
  host: HTMLElement,
  ownership: HostOwnership,
): boolean {
  return host.isConnected
    && candidate.element.isConnected
    && candidate.element.contains(host)
    && host.parentNode === ownership.parent
    && host.nextSibling === ownership.nextSibling;
}

function restoreDraft(
  candidate: TextBindingCandidate,
  host: HTMLElement,
  text: string,
  ownership: HostOwnership,
): boolean {
  if (!hostIsOwned(candidate, host, ownership)) return false;
  const original = candidate.textNode;
  // Normal typing replaces the original node inside the wrapper, leaving it
  // detached. If reconciliation moved that node into another live tree,
  // never move it back into the captured position.
  if (original.isConnected && original.parentNode !== host) return false;
  original.nodeValue = text;
  // Keep the original Text node and replace only the transient wrapper. This
  // preserves every sibling/descendant of an icon-plus-label host.
  host.replaceWith(original);
  return true;
}

function selectAll(host: HTMLElement): void {
  const doc = host.ownerDocument;
  const selection = doc.getSelection?.();
  if (!selection) return;
  const range = doc.createRange();
  range.selectNodeContents(host);
  selection.removeAllRanges();
  selection.addRange(range);
}

function isNodeInsideHost(host: HTMLElement, node: Node): boolean {
  return node === host || host.contains(node);
}

function rangeInsideHost(host: HTMLElement, range: Range | StaticRange): boolean {
  if (!isNodeInsideHost(host, range.startContainer)
    || !isNodeInsideHost(host, range.endContainer)) return false;
  // A host ancestor contains the common ancestor whenever both endpoints are
  // inside it; StaticRange does not expose commonAncestorContainer.
  return true;
}

function selectionInsideHost(host: HTMLElement): boolean {
  const selection = host.ownerDocument.getSelection?.();
  if (!selection || selection.rangeCount === 0) return false;
  for (let index = 0; index < selection.rangeCount; index += 1) {
    if (!rangeInsideHost(host, selection.getRangeAt(index))) return false;
  }
  return true;
}

const ALLOWED_INPUT_TYPES = new Set([
  "insertText",
  "insertReplacementText",
  "insertCompositionText",
  "insertFromComposition",
  "insertFromPaste",
  "deleteContentBackward",
  "deleteContentForward",
  "deleteByCut",
  "deleteByDrag",
]);

function isParagraphInputType(inputType: string): boolean {
  return inputType === "insertParagraph" || inputType === "insertLineBreak";
}

function isAllowedInputType(inputType: string): boolean {
  return ALLOWED_INPUT_TYPES.has(inputType);
}

function plainTextFromPaste(event: ClipboardEvent): string | null {
  try {
    const value = event.clipboardData?.getData("text/plain");
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

function hasParagraphBreak(value: string): boolean {
  return /[\r\n]/.test(value);
}

function replaceSelectionWithPlainText(host: HTMLElement, value: string): boolean {
  if (hasParagraphBreak(value) || !selectionInsideHost(host)) return false;
  const selection = host.ownerDocument.getSelection?.();
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = host.ownerDocument.createTextNode(value);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function flattenHostText(host: HTMLElement): string {
  const text = host.textContent ?? "";
  if (host.childNodes.length === 1 && host.firstChild?.nodeType === 3) return text;
  host.replaceChildren(host.ownerDocument.createTextNode(text));
  return text;
}

function resolveEmptyProjectionCandidate(
  marker: HTMLElement,
): TextBindingCandidate | TextEditRejection {
  if (!marker.isConnected) {
    return {
      kind: "rejected",
      reason: "no-binding",
      message: "The empty rendered-text affordance is no longer connected.",
    };
  }
  const changeId = marker.getAttribute(EMPTY_TEXT_PROJECTION_ATTR);
  if (!changeId) {
    return {
      kind: "rejected",
      reason: "no-binding",
      message: "The empty rendered-text affordance has no canonical change.",
    };
  }
  const change = getTextContentChangeById(changeId);
  if (!change || change.after.length !== 0) {
    return {
      kind: "rejected",
      reason: "no-binding",
      message: "The empty rendered-text affordance is stale.",
    };
  }
  if (marker.getAttribute(EMPTY_TEXT_PROJECTION_PATH_ATTR)
    !== (change.target.textNodePath ? `path:${change.target.textNodePath.join(",")}` : "root")) {
    return {
      kind: "rejected",
      reason: "no-binding",
      message: "The empty rendered-text affordance no longer identifies its text node.",
    };
  }
  const resolved = resolveTextProjectionTarget(marker.ownerDocument, change.target, "");
  if (resolved.status !== "resolved" || !resolved.element.contains(marker)) {
    return {
      kind: "rejected",
      reason: resolved.status === "ambiguous" ? "ambiguous-binding" : "no-binding",
      message: "The empty rendered text no longer has a unique source projection.",
    };
  }
  const textNode = resolveTextProjectionTextNode(resolved.element, change.target, "");
  if (!textNode || textNode.nodeValue !== "") {
    return {
      kind: "rejected",
      reason: "no-text",
      message: "The empty rendered text is no longer available for editing.",
    };
  }
  return {
    binding: { kind: "rendered-text", target: change.target },
    element: resolved.element,
    textNode,
    before: "",
    scope: change.scope ?? "rendered-instance",
    renderedTarget: change.target,
    renderedSource: {
      file: change.source.file,
      line: change.source.line,
      column: change.source.column,
      component: change.source.component,
      selector: change.selector,
      authoredAs: change.authoredAs,
      evidence: change.evidence,
    },
    emptyProjectionMarker: marker,
  };
}

function makeSession(candidate: TextBindingCandidate): InlineTextSession {
  const doc = candidate.element.ownerDocument;
  const originalSelection = captureSelection(doc);
  const OwnerHTMLElement = doc.defaultView?.HTMLElement;
  const previousActiveElement = OwnerHTMLElement && doc.activeElement instanceof OwnerHTMLElement
    ? doc.activeElement
    : null;
  const originalParent = candidate.textNode.parentNode;
  const originalNextSibling = candidate.textNode.nextSibling;
  if (!originalParent) {
    // `resolveTextBinding` only returns connected text nodes, but keep this
    // boundary defensive if a framework mutates between resolution and wrap.
    throw new Error("Inline text target lost its parent before editing began.");
  }
  const ownership: HostOwnership = { parent: originalParent, nextSibling: originalNextSibling };
  const capturedTarget = candidate.renderedTarget
    ?? captureTextProjectionTarget(candidate.element, candidate.before, candidate.textNode);
  const host = doc.createElement("span");
  host.setAttribute("data-inline-editor", "true");
  host.setAttribute("contenteditable", "plaintext-only");
  host.contentEditable = "plaintext-only";
  candidate.textNode.replaceWith(host);
  // An empty Text node is retained for exact restoration, but leaving it as
  // the first child of a native contenteditable makes Chromium insert the
  // first character beside it. The input handler then has to coalesce two
  // text nodes and the browser resets the caret to the start, reversing the
  // visible draft. Let the empty editor start childless; restoreDraft still
  // puts the captured node back at the owned insertion point on exit.
  if (candidate.before.length > 0) host.append(candidate.textNode);

  let finished = false;
  let blurCommitHandle: ReturnType<typeof setTimeout> | null = null;
  let compositionFinalizeHandle: ReturnType<typeof setTimeout> | null = null;
  let composing = false;
  let blurPending = false;
  let lastSafeText = candidate.before;
  let rejectedNextInput: InlineTextInputRejectionReason | null = null;
  let observer: MutationObserver | null = null;
  let session: InlineTextSession;
  let unregisterClearHandler: (() => void) | null = null;
  const ownerWindow = doc.defaultView;
  const history = ownerWindow?.history;
  const originalPushState = history?.pushState;
  const originalReplaceState = history?.replaceState;
  let patchedPushState: History["pushState"] | null = null;
  let patchedReplaceState: History["replaceState"] | null = null;
  let editDecision = initialTextEditDecision(candidate);

  function restoreHostText(text: string): void {
    host.replaceChildren(doc.createTextNode(text));
    lastSafeText = text;
  }

  function resumeDraft(text: string): boolean {
    const original = candidate.textNode;
    if (original.parentNode !== ownership.parent
      || original.nextSibling !== ownership.nextSibling) return false;
    original.replaceWith(host);
    restoreHostText(text);
    try {
      host.focus({ preventScroll: true });
    } catch {
      host.focus();
    }
    selectAll(host);
    return true;
  }

  function rejectInput(reason: InlineTextInputRejectionReason): void {
    recordDiagnostic({
      kind: "inline-text",
      status: "rejected",
      reason,
      before: candidate.before,
      after: host.textContent ?? "",
    });
  }

  function editorOwnsFocus(): boolean {
    const active = doc.activeElement;
    const OwnerNode = doc.defaultView?.Node;
    return active === host || Boolean(OwnerNode && active instanceof OwnerNode && host.contains(active));
  }

  function cancelForReconciliation(discardedDraft?: string): void {
    if (finished) return;
    const restoreFocus = editorOwnsFocus();
    // A moved/reordered host has no safe insertion point. Remove only the
    // temporary wrapper; never reinsert the original node into a new tree.
    if (host.isConnected) host.remove();
    finish("app-reconciled", "cancelled", discardedDraft, restoreFocus);
  }

  function finish(
    reason: InlineTextSessionEndReason,
    status: "committed" | "cancelled",
    after?: string,
    restoreFocus = false,
  ): void {
    if (finished) return;
    finished = true;
    host.removeEventListener("keydown", onKeyDown);
    host.removeEventListener("blur", onBlur);
    host.removeEventListener("beforeinput", onBeforeInput);
    host.removeEventListener("input", onInput);
    host.removeEventListener("paste", onPaste);
    host.removeEventListener("compositionstart", onCompositionStart);
    host.removeEventListener("compositionend", onCompositionEnd);
    host.removeEventListener("mousedown", suppressHostPointer);
    host.removeEventListener("mouseup", suppressHostPointer);
    host.removeEventListener("pointerdown", suppressHostPointer);
    host.removeEventListener("pointerup", suppressHostPointer);
    doc.removeEventListener("selectionchange", onSelectionChange);
    doc.removeEventListener("click", suppressInteractiveAction, true);
    doc.removeEventListener("mousedown", suppressInteractiveAction, true);
    doc.removeEventListener("mouseup", suppressInteractiveAction, true);
    doc.removeEventListener("pointerdown", suppressInteractiveAction, true);
    doc.removeEventListener("pointerup", suppressInteractiveAction, true);
    doc.removeEventListener("submit", suppressInteractiveAction, true);
    ownerWindow?.removeEventListener("pagehide", onFrameDisposed);
    ownerWindow?.removeEventListener("beforeunload", onFrameDisposed);
    ownerWindow?.removeEventListener("unload", onFrameDisposed);
    ownerWindow?.removeEventListener("popstate", onRouteDisposed);
    ownerWindow?.removeEventListener("hashchange", onRouteDisposed);
    if (history && originalPushState && history.pushState === patchedPushState) {
      history.pushState = originalPushState;
    }
    if (history && originalReplaceState && history.replaceState === patchedReplaceState) {
      history.replaceState = originalReplaceState;
    }
    observer?.disconnect();
    observer = null;
    if (blurCommitHandle !== null) {
      clearTimeout(blurCommitHandle);
      blurCommitHandle = null;
    }
    if (compositionFinalizeHandle !== null) {
      clearTimeout(compositionFinalizeHandle);
      compositionFinalizeHandle = null;
    }
    unregisterClearHandler?.();
    unregisterClearHandler = null;
    if (activeSession === session) {
      activeSession = null;
      activeSessionDocument = null;
      notify();
    }
    if (restoreFocus) {
      restoreSelection(doc, originalSelection);
      if (previousActiveElement && previousActiveElement.isConnected) {
        try {
          previousActiveElement.focus({ preventScroll: true });
        } catch {
          previousActiveElement.focus();
        }
      }
    }
    // A cancelled/unchanged re-entry keeps the same affordance. A committed
    // non-empty value is synchronously reconciled by the text projection,
    // which removes it after this session cleanup.
    if (candidate.emptyProjectionMarker?.isConnected) {
      candidate.emptyProjectionMarker.hidden = false;
    }
    recordDiagnostic({ kind: "inline-text", status, reason, before: candidate.before, after });
    schedulePendingInlineTextEdit();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (finished) return;
    if (event.isComposing || composing) {
      // Enter/Escape belong to the IME until compositionend. Keeping the
      // session alive makes the composition one canonical edit.
      event.stopPropagation();
      if (event.key === "Enter" || event.key === "Escape" || event.key === "Esc") {
        event.preventDefault();
      }
      return;
    }
    if (event.key === "Enter") {
      if (blurCommitHandle !== null) clearTimeout(blurCommitHandle);
      blurCommitHandle = null;
      event.preventDefault();
      event.stopPropagation();
      session.commit();
      return;
    }
    if (event.key === "Escape" || event.key === "Esc") {
      if (blurCommitHandle !== null) clearTimeout(blurCommitHandle);
      blurCommitHandle = null;
      event.preventDefault();
      event.stopPropagation();
      session.cancel();
      return;
    }
    // Keep inspector keyboard authority out of the draft while allowing the
    // browser to handle ordinary typing and caret movement natively. The
    // listener is scoped to this host so it does not intercept native input
    // before the contenteditable target sees it.
    event.stopPropagation();
  }

  function onBlur(): void {
    if (finished) return;
    blurPending = true;
    if (composing) return;
    // Deferring one macrotask lets Escape cancel a browser blur that occurs
    // while a contenteditable host is handling the key event.
    blurCommitHandle = setTimeout(() => {
      blurCommitHandle = null;
      if (!finished) {
        blurPending = false;
        session.commit("blur");
      }
    }, 0);
  }

  function onBeforeInput(event: InputEvent): void {
    if (finished) return;
    const rejectBeforeInput = (reason: InlineTextInputRejectionReason): void => {
      // Some browsers still deliver input after a non-cancelable beforeinput.
      // Remember the safe plain draft so that onInput can undo that mutation.
      if (!event.cancelable) rejectedNextInput = reason;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      rejectInput(reason);
    };
    const ranges = typeof event.getTargetRanges === "function"
      ? event.getTargetRanges()
      : [];
    const inHost = ranges.length > 0
      ? ranges.every((range) => rangeInsideHost(host, range))
      : selectionInsideHost(host);
    if (!inHost) {
      rejectBeforeInput("cross-host-range");
      return;
    }
    const inputType = event.inputType ?? "";
    if (isParagraphInputType(inputType)) {
      rejectBeforeInput("paragraph-input");
      return;
    }
    if (!inputType) {
      rejectBeforeInput("invalid-input-type");
      return;
    }
    if (!isAllowedInputType(inputType)) {
      rejectBeforeInput("rich-input");
      return;
    }
    rejectedNextInput = null;
    lastSafeText = host.textContent ?? "";
    event.stopPropagation();
  }

  function onInput(event: Event): void {
    if (finished) return;
    if (rejectedNextInput !== null) {
      const reason = rejectedNextInput;
      rejectedNextInput = null;
      event.preventDefault();
      event.stopPropagation();
      restoreHostText(lastSafeText);
      rejectInput(reason);
      return;
    }
    if (hasParagraphBreak(host.textContent ?? "")) {
      event.preventDefault();
      restoreHostText(lastSafeText);
      rejectInput("paragraph-input");
      return;
    }
    lastSafeText = flattenHostText(host);
    event.stopPropagation();
  }

  function onPaste(event: ClipboardEvent): void {
    if (finished) return;
    event.preventDefault();
    event.stopPropagation();
    const value = plainTextFromPaste(event);
    if (value === null) {
      const clipboard = ownerWindow?.navigator.clipboard;
      const readText = clipboard?.readText;
      if (typeof readText !== "function") {
        rejectInput("clipboard-unavailable");
        return;
      }
      let clipboardResult: PromiseLike<string> | string;
      try {
        clipboardResult = readText.call(clipboard);
      } catch {
        rejectInput("clipboard-unavailable");
        return;
      }
      void Promise.resolve(clipboardResult)
        .then((clipboardText) => {
          if (finished || activeSession !== session || typeof clipboardText !== "string") return;
          if (hasParagraphBreak(clipboardText)) {
            rejectInput("multiline-paste");
            return;
          }
          if (!replaceSelectionWithPlainText(host, clipboardText)) {
            rejectInput("invalid-selection");
            return;
          }
          lastSafeText = flattenHostText(host);
        })
        .catch(() => {
          if (!finished && activeSession === session) rejectInput("clipboard-unavailable");
        });
      return;
    }
    if (hasParagraphBreak(value)) {
      rejectInput("multiline-paste");
      return;
    }
    if (!replaceSelectionWithPlainText(host, value)) {
      rejectInput("invalid-selection");
      return;
    }
    lastSafeText = flattenHostText(host);
  }

  function onCompositionStart(event: CompositionEvent): void {
    composing = true;
    blurPending = false;
    event.stopPropagation();
  }

  function onCompositionEnd(event: CompositionEvent): void {
    composing = false;
    lastSafeText = flattenHostText(host);
    event.stopPropagation();
    if (blurPending && !finished) {
      blurPending = false;
      // Browsers may dispatch the final insertCompositionText/input after
      // compositionend. Commit on the next macrotask so those final chars are
      // part of this one canonical edit.
      compositionFinalizeHandle = setTimeout(() => {
        compositionFinalizeHandle = null;
        if (!finished && !composing) session.commit("blur");
      }, 0);
    }
  }

  function onSelectionChange(): void {
    if (finished) return;
    const selection = doc.getSelection?.();
    if (!selection || selection.rangeCount === 0) {
      // A panel click can clear the page selection before blur; let blur own
      // the normal commit path unless the editing host still owns focus.
      if (doc.activeElement === host) endLifecycle("selection-removed");
      return;
    }
    if (selection && selection.rangeCount > 0 && selectionInsideHost(host)) return;
    // A removed selection/host is a lifecycle end, not a text operation. The
    // original node is restored only while its owning host is still connected.
    if (!host.isConnected || !candidate.element.isConnected) {
      endLifecycle(!host.isConnected ? "host-removed" : "selection-removed");
      return;
    }
    if (doc.activeElement === host) endLifecycle("selection-removed");
  }

  function suppressInteractiveAction(event: Event): void {
    if (finished) return;
    const target = event.target;
    const OwnerNode = doc.defaultView?.Node;
    if (!OwnerNode || !(target instanceof OwnerNode)) return;
    if (host.contains(target)) {
      // All down/up events must reach the native editing host so caret and
      // drag-selection behavior remains intact. The click itself is held so
      // the app cannot activate the surrounding button/link.
      if (event.type === "mousedown" || event.type === "mouseup"
        || event.type === "pointerdown" || event.type === "pointerup") return;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const inspectorRoot = doc.getElementById("nudge-ui-root");
    if (inspectorRoot && (target === inspectorRoot || inspectorRoot.contains(target))) return;
    // At the document boundary, application actions are suspended for the
    // duration of the draft. Inspector controls live in the scoped shadow
    // host above and remain usable.
    if (event.type !== "mousedown" && event.type !== "mouseup"
      && event.type !== "pointerdown" && event.type !== "pointerup") {
      event.preventDefault();
    }
    event.stopPropagation();
  }

  function suppressHostPointer(event: Event): void {
    // Keep the native default (focus transfer, caret placement, and drag
    // selection) while preventing an application ancestor from observing the
    // temporary host's pointer sequence.
    event.stopPropagation();
  }

  function onFrameDisposed(): void {
    endLifecycle("frame-disposed");
  }

  function onRouteDisposed(): void {
    endLifecycle("route-disposed");
  }

  function patchRouteHistory(): void {
    if (!history || !originalPushState || !originalReplaceState) return;
    try {
      // SAFETY: the wrapper has the same History.pushState parameter/return contract;
      // assignment is guarded by the captured native method and restored on finish.
      patchedPushState = function(this: History, ...args: Parameters<History["pushState"]>) {
        if (!finished) endLifecycle("route-disposed");
        return originalPushState.apply(this, args);
      } as History["pushState"];
      // SAFETY: the wrapper has the same History.replaceState parameter/return contract;
      // assignment is guarded by the captured native method and restored on finish.
      patchedReplaceState = function(this: History, ...args: Parameters<History["replaceState"]>) {
        if (!finished) endLifecycle("route-disposed");
        return originalReplaceState.apply(this, args);
      } as History["replaceState"];
      history.pushState = patchedPushState;
      history.replaceState = patchedReplaceState;
    } catch {
      patchedPushState = null;
      patchedReplaceState = null;
    }
  }

  function endLifecycle(
    reason: Exclude<InlineTextSessionEndReason, "commit" | "cancel" | "blur">,
    discardedDraft?: string,
  ): void {
    if (finished) return;
    discardPendingInlineTextEdit(doc);
    const restoreFocus = editorOwnsFocus();
    if (hostIsOwned(candidate, host, ownership)) {
      if (!restoreDraft(candidate, host, candidate.before, ownership)) {
        cancelForReconciliation();
        return;
      }
    } else if (host.isConnected) {
      // A reconciliation can move the temporary host before removing the
      // original root. It no longer has an owned insertion point, so remove
      // the wrapper rather than leaking an editor into the new tree.
      host.remove();
    }
    finish(reason, "cancelled", discardedDraft, restoreFocus);
  }

  session = {
    get binding(): TextEditBinding {
      return getTextEditBinding(candidate, editDecision, capturedTarget);
    },
    get bindingChoices(): readonly TextBindingChoice[] {
      return candidate.bindingChoices ?? [];
    },
    get selectedBindingIndex(): number | null {
      return editDecision.bindingIndex;
    },
    get scope(): TextProjectionScope {
      return editDecision.scope;
    },
    get scopeChoices(): readonly TextProjectionScope[] {
      return getTextEditScopeChoices(candidate, editDecision);
    },
    host,
    before: candidate.before,
    chooseBinding(index: number): void {
      if (finished) return;
      const decision = chooseTextEditBinding(candidate, index);
      if (!decision) return;
      editDecision = decision;
      notify();
    },
    chooseScope(scope: TextProjectionScope): void {
      if (finished || !getTextEditScopeChoices(candidate, editDecision).includes(scope)) return;
      editDecision = { ...editDecision, scope };
      notify();
    },
    commit(reason: InlineTextSessionEndReason = "commit"): ChangeRecord | null {
      if (finished) return null;
      if (composing) {
        blurPending = true;
        return null;
      }
      if ((candidate.bindingChoices?.length ?? 0) > 1 && editDecision.bindingIndex === null) return null;
      if (!hostIsOwned(candidate, host, ownership)) {
        endLifecycle(!candidate.element.isConnected ? "app-reconciled" : "host-removed");
        return null;
      }
      const after = flattenHostText(host);
      if (hasParagraphBreak(after)) {
        rejectInput("paragraph-input");
        restoreHostText(lastSafeText);
        return null;
      }
      const unchanged = after === candidate.before;
      const change = unchanged ? null : prepareTextEditChange(candidate, editDecision, capturedTarget, after);
      if (!unchanged && !change) {
        endLifecycle("app-reconciled", after);
        return null;
      }
      // Always remove the temporary host before appending the canonical
      // change. The React Adapter must own the permanent preview.
      const restoreFocus = editorOwnsFocus();
      if (!restoreDraft(candidate, host, candidate.before, ownership)) {
        cancelForReconciliation();
        return null;
      }
      if (change?.kind === "text-content" && editDecision.scope === "rendered-instance") {
        // The second text value is alternate evidence for re-entry after a
        // previous projection. Validation happens after unwrapping because a
        // mounted draft can make another identical root look unique.
        const resolved = resolveTextProjectionTarget(doc, change.target, candidate.before);
        if (resolved.status !== "resolved") {
          if (!resumeDraft(after)) cancelForReconciliation(after);
          return null;
        }
      }
      if (change) {
        try {
          if (appendChange(change) === "blocked") {
            if (!resumeDraft(after)) cancelForReconciliation(after);
            return null;
          }
        } catch (error) {
          if (!resumeDraft(after)) cancelForReconciliation(after);
          throw error;
        }
      }
      finish(reason, "committed", after, restoreFocus);
      return change;
    },
    cancel(reason: InlineTextSessionEndReason = "cancel"): void {
      if (finished) return;
      if (!hostIsOwned(candidate, host, ownership)) {
        endLifecycle("app-reconciled");
        return;
      }
      const restoreFocus = editorOwnsFocus();
      if (!restoreDraft(candidate, host, candidate.before, ownership)) {
        cancelForReconciliation();
        return;
      }
      finish(reason, "cancelled", candidate.before, restoreFocus);
    },
  };

  host.addEventListener("keydown", onKeyDown);
  host.addEventListener("blur", onBlur);
  host.addEventListener("beforeinput", onBeforeInput);
  host.addEventListener("input", onInput);
  host.addEventListener("paste", onPaste);
  host.addEventListener("compositionstart", onCompositionStart);
  host.addEventListener("compositionend", onCompositionEnd);
  host.addEventListener("mousedown", suppressHostPointer);
  host.addEventListener("mouseup", suppressHostPointer);
  host.addEventListener("pointerdown", suppressHostPointer);
  host.addEventListener("pointerup", suppressHostPointer);
  doc.addEventListener("selectionchange", onSelectionChange);
  for (const eventName of ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "submit"] as const) {
    doc.addEventListener(eventName, suppressInteractiveAction, true);
  }
  patchRouteHistory();
  ownerWindow?.addEventListener("pagehide", onFrameDisposed);
  ownerWindow?.addEventListener("beforeunload", onFrameDisposed);
  ownerWindow?.addEventListener("unload", onFrameDisposed);
  ownerWindow?.addEventListener("popstate", onRouteDisposed);
  ownerWindow?.addEventListener("hashchange", onRouteDisposed);
  const OwnerMutationObserver = ownerWindow?.MutationObserver;
  if (OwnerMutationObserver && doc.documentElement) {
    observer = new OwnerMutationObserver(() => {
      if (finished) return;
      if (!hostIsOwned(candidate, host, ownership)) endLifecycle("app-reconciled");
    });
    observer.observe(doc.documentElement, { childList: true, subtree: true });
  }
  activeSession = session;
  activeSessionDocument = doc;
  unregisterClearHandler = registerInlineTextClearHandler(cancelInlineTextEdit);
  notify();
  recordDiagnostic({ kind: "inline-text", status: "started", reason: "start", before: candidate.before });

  host.focus();
  selectAll(host);
  return session;
}

export const inlineTextEditor: InlineTextEditor = {
  begin(element, point) {
    if (!isNudgeUiDev()) {
      return {
        kind: "rejected",
        reason: "no-binding",
        message: "Inline text editing is available only in development.",
      };
    }
    if (activeSession) {
      return {
        kind: "rejected",
        reason: "editing-active",
        message: "Finish the current inline text edit first.",
      };
    }
    const candidate = resolveTextBinding(element, point);
    if (isTextEditRejection(candidate)) return candidate;
    return makeSession(candidate);
  },
};

/** Re-enter an existing canonical rendered-text projection through its empty
 * inspector affordance. This never guesses a new DOM target or source node. */
export function beginInlineTextEditFromEmptyProjection(
  marker: HTMLElement,
): InlineTextSession | TextEditRejection {
  if (!isNudgeUiDev()) {
    return {
      kind: "rejected",
      reason: "no-binding",
      message: "Inline text editing is available only in development.",
    };
  }
  if (activeSession) {
    return {
      kind: "rejected",
      reason: "editing-active",
      message: "Finish the current inline text edit first.",
    };
  }
  const candidate = resolveEmptyProjectionCandidate(marker);
  if (isTextEditRejection(candidate)) return candidate;
  // Hide the affordance while its retained empty Text node is wrapped by the
  // native editor. The marker is restored on cancel and removed by projection
  // reconciliation on a successful non-empty commit.
  marker.hidden = true;
  try {
    return makeSession(candidate);
  } catch {
    marker.hidden = false;
    return {
      kind: "rejected",
      reason: "no-binding",
      message: "The empty rendered text could not be reopened safely.",
    };
  }
}

export function beginInlineTextEdit(
  element: HTMLElement,
  point?: { x: number; y: number },
): InlineTextSession | TextEditRejection {
  if (!isNudgeUiDev()) {
    return {
      kind: "rejected",
      reason: "no-binding",
      message: "Inline text editing is available only in development.",
    };
  }
  return inlineTextEditor.begin(element, point);
}

export { resolveTextBinding } from "../componentSemantics/textBinding.ts";
