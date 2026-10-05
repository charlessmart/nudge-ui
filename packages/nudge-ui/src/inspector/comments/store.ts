import { useSyncExternalStore } from "react";
import { isRenderedInstanceRef, type RenderedInstanceRef } from "../changes/editModel.ts";
import { useCanvasCards, useFocusedCardId, useSelectedCardId } from "../canvas/canvasStore.ts";
import { canWriteWorkspace } from "../canvas/workspaceLease.ts";
import { contentEditTarget } from "../canvas/frameContent.ts";
import { documentTarget, targetKey, type DraftTarget } from "../drafts/model.ts";
import { getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";

export interface ElementComment {
  readonly id: string;
  readonly route: string;
  readonly target: RenderedInstanceRef;
  readonly tag: string;
  readonly note: string;
  readonly baseline: string;
  readonly viewport: string;
  readonly handedOff: boolean;
}

let comments: readonly ElementComment[] = [];
let loadedKey: string | null = null;
let loadedDemo = false;
const listeners = new Set<() => void>();
const toolListeners = new Set<() => void>();
let commentToolActive = false;
let clearRevision = 0;

function storageKey(): string {
  return `nudge-ui:${getNudgeUiRuntimeConfig().projectId}:comments:v1`;
}

function isComment(value: unknown): value is ElementComment {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return ["id", "route", "tag", "note", "baseline", "viewport"].every((key) => typeof item[key] === "string")
    && typeof item.handedOff === "boolean" && isRenderedInstanceRef(item.target);
}

export function getComments(): readonly ElementComment[] {
  const key = storageKey();
  const demo = getNudgeUiRuntimeConfig().demo === true;
  if (loadedKey !== key || loadedDemo !== demo) {
    loadedKey = key;
    loadedDemo = demo;
    try {
      const saved: unknown = demo ? [] : JSON.parse(localStorage.getItem(key) ?? "[]");
      comments = Array.isArray(saved) ? saved.filter(isComment) : [];
    } catch {
      comments = [];
    }
  }
  return comments;
}

export function loadComments(): void {
  loadedKey = null;
  clearRevision += 1;
  getComments();
  for (const listener of listeners) listener();
}

function publish(next: readonly ElementComment[]): void {
  if (!canWriteWorkspace()) return;
  comments = next;
  if (getNudgeUiRuntimeConfig().demo !== true) {
    try { localStorage.setItem(storageKey(), JSON.stringify(next)); } catch {}
  }
  for (const listener of listeners) listener();
}

export function subscribeComments(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useComments(): readonly ElementComment[] {
  return useSyncExternalStore(subscribeComments, getComments, getComments);
}

export function getCommentsForTarget(target: DraftTarget): readonly ElementComment[] {
  return getComments().filter((comment) => targetKey(documentTarget(comment.route)) === targetKey(target));
}

export function useFrameComments(): readonly ElementComment[] {
  useComments();
  const cards = useCanvasCards();
  const selected = useSelectedCardId();
  const focused = useFocusedCardId();
  const card = cards.find((card) => card.id === selected) ?? cards.find((card) => card.id === focused) ?? cards[0];
  return getCommentsForTarget(card ? contentEditTarget(card.content) : documentTarget(window.location.href));
}

export function saveComment(comment: ElementComment): void {
  const current = getComments();
  publish([...current.filter((item) => item.id !== comment.id), comment]);
}

export function removeComment(id: string): void {
  publish(getComments().filter((item) => item.id !== id));
}

export function getCommentClearRevision(): number { return clearRevision; }

/** Clears saved notes and invalidates any open or saving comment draft. */
export function clearComments(target?: DraftTarget): void {
  if (!canWriteWorkspace()) return;
  getComments();
  clearRevision += 1;
  const cleared = new Set((target ? getCommentsForTarget(target) : getComments()).map((comment) => comment.id));
  publish(getComments().filter((comment) => !cleared.has(comment.id)));
}

/** Arms only the exact notes successfully copied or accepted by an agent. */
export function markCommentsHandedOff(sent: readonly ElementComment[]): void {
  publish(getComments().map((item) => sent.some((candidate) => candidate.id === item.id && candidate.note === item.note)
    ? { ...item, handedOff: true } : item));
}

export function setCommentToolActive(active: boolean): void {
  if (commentToolActive === active) return;
  commentToolActive = active;
  for (const listener of toolListeners) listener();
}
export function isCommentToolActive(): boolean { return commentToolActive; }

export function useCommentToolActive(): boolean {
  return useSyncExternalStore((listener) => {
    toolListeners.add(listener);
    return () => toolListeners.delete(listener);
  }, isCommentToolActive, isCommentToolActive);
}

export function commentRoute(doc: Document): string {
  const url = new URL(doc.location.href);
  url.hash = "";
  url.searchParams.delete("nudge-ui");
  url.searchParams.sort();
  return url.href;
}
