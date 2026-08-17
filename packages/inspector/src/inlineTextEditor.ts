import { useSyncExternalStore } from "react";
import { appendChange } from "./changesLog.ts";
import { registerInlineTextClearHandler } from "./inlineTextLifecycle.ts";
import {
  createComponentPropChange,
} from "./componentSemantics/changeModel.ts";
import {
  resolveTextBinding,
  type TextBindingChoice,
  type TextBindingCandidate,
  type TextEditBinding,
  type TextEditRejection,
} from "./componentSemantics/textBinding.ts";
import type { ChangeRecord, TextContentChangeRecord } from "./changes/types.ts";
import type { ComponentInvocationEvidence } from "./componentSemantics/types.ts";
import type { TextProjectionScope } from "./textChangeBoundary.ts";
import {
  captureTextProjectionTarget,
  EMPTY_TEXT_PROJECTION_ATTR,
  EMPTY_TEXT_PROJECTION_PATH_ATTR,
  getTextContentChangeById,
  resolveTextProjectionTarget,
  resolveTextProjectionTextNode,
  textProjectionSelector,
} from "./textProjection.ts";

export type { TextEditBinding, TextEditRejection } from "./componentSemantics/textBinding.ts";
export type { TextBindingCandidate } from "./componentSemantics/textBinding.ts";

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
let sessionRevision = 0;
let inlineTextDiagnostics: InlineTextDiagnostic[] = [];
const diagnosticListeners = new Set<() => void>();

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
  activeSession?.cancel("cancel");
}

/** End a session owned by a document/frame that is about to be disposed. */
export function disposeInlineTextEdit(
  reason: "frame-disposed" | "route-disposed" = "frame-disposed",
  ownerDocument?: Document,
): void {
  if (ownerDocument && activeSessionDocument !== ownerDocument) return;
  activeSession?.cancel(reason);
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

function sourceForChoice(
  candidate: TextBindingCandidate,
  choice: TextBindingChoice | null,
): NonNullable<TextBindingCandidate["renderedSource"]> {
  if (choice?.renderedSource) return choice.renderedSource;
  if (candidate.renderedSource
    && (!choice || candidate.renderedSource.evidence?.callsiteId === choice.binding.target.callsiteId
      && candidate.renderedSource.evidence.property === choice.binding.property)) {
    return candidate.renderedSource;
  }
  const parsed = /^(.*):(\d+):(\d+)$/.exec(candidate.element.getAttribute("data-src") ?? "");
  const target = choice?.binding.target;
  const authoredAs = choice?.authoredAs === "literal"
    ? "literal"
    : choice?.authoredAs === "expression" || choice?.authoredAs === "spread"
      ? "expression"
      : "unknown";
  return {
    file: target?.file ?? parsed?.[1] ?? candidate.element.getAttribute("data-src") ?? "",
    line: target?.line ?? Number(parsed?.[2] ?? 0),
    column: target?.column ?? Number(parsed?.[3] ?? 0),
    component: target?.componentName ?? candidate.element.getAttribute("data-cid") ?? "Rendered text",
    selector: candidate.binding.kind === "rendered-text"
      ? textProjectionSelector(candidate.binding.target) ?? ""
      : "",
    authoredAs,
    evidence: choice ? {
      callsiteId: choice.binding.target.callsiteId,
      componentName: choice.binding.target.componentName,
      property: choice.binding.property,
      mountedCount: choice.mountedCount,
    } : undefined,
  };
}

function componentEvidence(
  candidate: TextBindingCandidate,
  choice: TextBindingChoice,
): ComponentInvocationEvidence {
  const target = choice.renderedTarget
    ?? candidate.renderedTarget
    ?? captureTextProjectionTarget(candidate.element, candidate.before, candidate.textNode);
  return {
    occurrence: target?.occurrence ?? 0,
    props: target?.props ?? candidate.element.getAttribute("data-cprops"),
    ariaLabel: target?.ariaLabel ?? candidate.element.getAttribute("aria-label"),
    beforeText: candidate.before,
    mountedCount: choice.mountedCount,
  };
}

function textTargetFor(
  candidate: TextBindingCandidate,
  binding: TextEditBinding,
  choice: TextBindingChoice | null,
): ReturnType<typeof captureTextProjectionTarget> {
  if (choice?.renderedTarget) return choice.renderedTarget;
  if (candidate.renderedTarget) return candidate.renderedTarget;
  if (binding.kind === "rendered-text") return binding.target;
  return captureTextProjectionTarget(candidate.element, candidate.before, candidate.textNode);
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
  const previousActiveElement = doc.activeElement instanceof HTMLElement
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
  host.setAttribute("data-dt-inline-editor", "true");
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
  let selectedChoice: TextBindingChoice | null = candidate.bindingChoices?.length === 1
    ? candidate.bindingChoices[0]!
    : null;
  let selectedScope: TextProjectionScope = candidate.scope
    ?? (candidate.binding.kind === "rendered-text" ? "rendered-instance" : "source-site");

  function currentBinding(): TextEditBinding {
    if (!selectedChoice) return candidate.binding;
    if (selectedChoice.mountedCount > 1 && selectedChoice.authoredAs !== "literal") {
      const target = selectedChoice.renderedTarget
        ?? candidate.renderedTarget
        ?? capturedTarget;
      return target ? { kind: "rendered-text", target } : selectedChoice.binding;
    }
    return selectedChoice.binding;
  }

  function currentScopeChoices(): readonly TextProjectionScope[] {
    if (selectedChoice && selectedChoice.mountedCount > 1 && selectedChoice.authoredAs === "literal") {
      return ["rendered-instance", "source-site"];
    }
    return candidate.scopeChoices ?? [];
  }

  function restoreHostText(text: string): void {
    host.replaceChildren(doc.createTextNode(text));
    lastSafeText = text;
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
    return active === host || (active instanceof Node && host.contains(active));
  }

  function cancelForReconciliation(): void {
    if (finished) return;
    const restoreFocus = editorOwnsFocus();
    // A moved/reordered host has no safe insertion point. Remove only the
    // temporary wrapper; never reinsert the original node into a new tree.
    if (host.isConnected) host.remove();
    finish("app-reconciled", "cancelled", undefined, restoreFocus);
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
    doc.removeEventListener("dblclick", suppressInteractiveAction, true);
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
    if (!(target instanceof Node)) return;
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
    const inspectorRoot = doc.getElementById("design-tool-root");
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

  function endLifecycle(reason: Exclude<InlineTextSessionEndReason, "commit" | "cancel" | "blur">): void {
    if (finished) return;
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
    finish(reason, "cancelled", undefined, restoreFocus);
  }

  session = {
    get binding(): TextEditBinding {
      return currentBinding();
    },
    get bindingChoices(): readonly TextBindingChoice[] {
      return candidate.bindingChoices ?? [];
    },
    get selectedBindingIndex(): number | null {
      if (!selectedChoice) return null;
      return candidate.bindingChoices?.indexOf(selectedChoice) ?? null;
    },
    get scope(): TextProjectionScope {
      return selectedScope;
    },
    get scopeChoices(): readonly TextProjectionScope[] {
      return currentScopeChoices();
    },
    host,
    before: candidate.before,
    chooseBinding(index: number): void {
      if (finished) return;
      const choice = candidate.bindingChoices?.[index];
      if (!choice) return;
      selectedChoice = choice;
      selectedScope = choice.mountedCount > 1 && choice.authoredAs === "literal"
        ? "rendered-instance"
        : choice.mountedCount > 1 ? "rendered-instance" : "source-site";
      notify();
    },
    chooseScope(scope: TextProjectionScope): void {
      if (finished || !currentScopeChoices().includes(scope)) return;
      selectedScope = scope;
      notify();
    },
    commit(reason: InlineTextSessionEndReason = "commit"): ChangeRecord | null {
      if (finished) return null;
      if ((candidate.bindingChoices?.length ?? 0) > 1 && !selectedChoice) return null;
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
      const binding = currentBinding();
      const choice = selectedChoice
        ?? (candidate.bindingChoices?.[0]
          ?? (candidate.editableTarget && candidate.mountedCount !== undefined
            ? {
              binding: candidate.binding.kind === "component-prop"
                ? candidate.binding
                : {
                  kind: "component-prop" as const,
                  property: "children",
                  target: {
                    framework: candidate.editableTarget.framework,
                    componentId: candidate.editableTarget.contract.componentId,
                    callsiteId: candidate.editableTarget.meta.callsiteId,
                    componentName: candidate.editableTarget.meta.componentName,
                    file: candidate.editableTarget.meta.file,
                    line: candidate.editableTarget.meta.line,
                    column: candidate.editableTarget.meta.column,
                  },
                },
              editableTarget: candidate.editableTarget,
              mountedCount: candidate.mountedCount,
              authoredAs: candidate.editableTarget.meta.authoredProps[candidate.binding.kind === "component-prop" ? candidate.binding.property : "children"]
                ?? "default",
              renderedTarget: candidate.renderedTarget ?? null,
              renderedSource: candidate.renderedSource,
            }
            : null));
      const unchanged = after === candidate.before;
      // Always remove the temporary host before appending the canonical
      // change. The React Adapter must own the permanent preview.
      const restoreFocus = editorOwnsFocus();
      if (!restoreDraft(candidate, host, candidate.before, ownership)) {
        cancelForReconciliation();
        return null;
      }
      finish(reason, "committed", after, restoreFocus);
      if (unchanged) return null;
      if (binding.kind === "component-prop" && selectedScope === "source-site") {
        const editableTarget = choice?.editableTarget ?? candidate.editableTarget;
        if (!editableTarget) return null;
        const prop = editableTarget.contract.props.find((item) =>
          item.name === binding.property && item.control === "text");
        if (!prop) return null;
        const change = createComponentPropChange(editableTarget, prop, after, {
          scope: "source-site",
          evidence: choice && choice.mountedCount > 1
            ? componentEvidence(candidate, choice)
            : undefined,
        });
        appendChange(change);
        return change;
      }
      const textTarget = textTargetFor(candidate, binding, choice);
      const source = sourceForChoice(candidate, choice);
      const renderedSource = source.selector || !textTarget
        ? source
        : { ...source, selector: textProjectionSelector(textTarget) ?? "" };
      if (!textTarget || !renderedSource.selector) return null;
      // Before appending an instance projection, prove the selected rendered
      // root remains unique using before-text evidence. Identical roots must
      // reject; occurrence is presentation metadata only.
      if (selectedScope === "rendered-instance") {
        // Re-entry candidates have a durable target whose original `beforeText`
        // is no longer present: the current canonical value is the empty
        // string. Use the candidate's current draft baseline as bounded
        // evidence while still requiring one source/evidence root.
        const resolved = resolveTextProjectionTarget(doc, textTarget, candidate.before);
        if (resolved.status !== "resolved") return null;
      }
      const change: TextContentChangeRecord = {
        kind: "text-content",
        id: `text-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
        target: textTarget,
        source: {
          file: renderedSource.file,
          line: renderedSource.line,
          column: renderedSource.column,
          component: renderedSource.component,
        },
        selector: renderedSource.selector,
        before: candidate.before,
        after,
        authoredAs: renderedSource.authoredAs,
        scope: selectedScope,
        evidence: renderedSource.evidence,
      };
      appendChange(change);
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
  for (const eventName of ["click", "dblclick", "mousedown", "mouseup", "pointerdown", "pointerup", "submit"] as const) {
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
  unregisterClearHandler = registerInlineTextClearHandler(() => session.cancel("cancel"));
  notify();
  recordDiagnostic({ kind: "inline-text", status: "started", reason: "start", before: candidate.before });

  host.focus();
  selectAll(host);
  return session;
}

export const inlineTextEditor: InlineTextEditor = {
  begin(element, point) {
    if (!import.meta.env.DEV) {
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
  if (!import.meta.env.DEV) {
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
  if (!import.meta.env.DEV) {
    return {
      kind: "rejected",
      reason: "no-binding",
      message: "Inline text editing is available only in development.",
    };
  }
  return inlineTextEditor.begin(element, point);
}

export { resolveTextBinding } from "./componentSemantics/textBinding.ts";
