import type { FrameContent } from "./frameContent.ts";
import type { HtmlArtifactMetadata } from "../../transport/artifacts.ts";
import { iterationId, contentSourceUrl } from "./frameContent.ts";
import { frameLifecycle } from "./frameLifecycle.ts";
import { recordCanvasChange, discardCanvasHistory } from "../workspace/timeline.ts";
import { useSyncExternalStore } from "react";
import {
  DEFAULT_CAMERA,
  getBoardCamera,
  placeBoardCamera,
  restoreCanvasView,
  setCanvasMode,
  type CanvasCamera,
  type CanvasMode,
  type CanvasPresentation,
} from "./viewStore.ts";
import { normalizeUrl, normalizedUrlKey, type NormalizedUrl } from "./normalizeUrl.ts";
import {
  applyLayoutShifts,
  boundsOf,
  centerCamera,
  fitCamera,
  layoutShifts,
  nextCardPosition,
  pushOverlappingCards,
  reinsertInRecordedOrder,
  iterationPosition,
  type Bounds,
} from "./layout.ts";

export interface FrameGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasCard extends FrameGeometry {
  id: string;
  content: FrameContent;
  entrance?: "linked" | "iteration";
  /** Directly placed iterations skip entrance animation, including on redo. */
  animateEntrance?: boolean;
  title: string | null;
}

export const CARD_GAP = 40;
export const FIT_ALL_PADDING = 80;
export const PRIMARY_CARD_INSET = 40;

function defaultViewportSize() {
  return {
    width: window.innerWidth || 1024,
    height: window.innerHeight || 768,
  };
}

let cards: CanvasCard[] = [];
let focusedCardId: string | null = null;
let selectedCardId: string | null = null;
let cardIdCounter = 0;
let lastUsedCardSize: { width: number; height: number } | null = null;
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getCards(): CanvasCard[] {
  return cards;
}

let notificationDepth = 0;
let notificationPending = false;

export function batchCanvasChanges<T>(operation: () => T): T {
  notificationDepth += 1;
  try { return operation(); } finally {
    notificationDepth -= 1;
    if (notificationDepth === 0 && notificationPending) { notificationPending = false; notify(); }
  }
}

function notify(): void {
  if (notificationDepth > 0) { notificationPending = true; return; }
  listeners.forEach((l) => l());
}

/** Adds one card to the end of the row. */
export function addCanvasCard(url: string, title?: string): CanvasCard {
  const before = cards;
  const size = lastUsedCardSize ?? defaultViewportSize();
  const pos = nextCardPosition(cards, CARD_GAP);
  const card: CanvasCard = {
    id: `card-${++cardIdCounter}`,
    content: { kind: "route", url },
    title: title ?? null,
    x: pos.x,
    y: pos.y,
    width: size.width,
    height: size.height,
  };
  cards = [...cards, card];
  lastUsedCardSize = { width: size.width, height: size.height };
  recordCreation(before, [card]);
  notify();
  return card;
}

let activateHistoryCard: (cardId: string) => void = () => undefined;

/** Connects canvas replay to the draft controller without coupling the stores. */
export function setCanvasHistoryActivator(activate: (cardId: string) => void): void {
  activateHistoryCard = activate;
}

function recordCreation(before: readonly CanvasCard[], created: readonly CanvasCard[]): void {
  const createdIds = new Set(created.map((card) => card.id));
  const after = cards.map((card) => ({ ...card }));
  const oldFocus = selectedCardId ?? focusedCardId ?? before[0]?.id;
  const shifts = layoutShifts(before, cards);
  const restore = (redo: boolean) => {
    if (!redo) {
      // Direct creation drags finish placement after recording, so redo must recover the dropped geometry and title.
      for (const [index, recorded] of after.entries()) {
        const current = createdIds.has(recorded.id) && cards.find((card) => card.id === recorded.id);
        if (current) after[index] = { ...current };
      }
    }
    cards = applyLayoutShifts(cards.filter((card) => !createdIds.has(card.id)), shifts, redo);
    if (redo) cards = reinsertInRecordedOrder(cards, after, createdIds);
    const focus = redo ? created[0]?.id : oldFocus;
    const target = cards.find((card) => card.id === focus) ?? cards[0];
    focusedCardId = target?.id ?? null;
    selectedCardId = focusedCardId;
    if (target) {
      activateHistoryCard(target.id);
      focusCanvasCards([target.id]);
    }
    notify();
  };
  recordCanvasChange({
    cardIds: [...createdIds],
    undo: () => restore(false),
    redo: () => restore(true),
    dispose: () => {
      for (const card of created) releaseUnusedIteration(card);
    },
  });
}

function selectFallbackAfterRemoval(removedIds: ReadonlySet<string>): void {
  const fallbackId = cards[0]?.id ?? null;
  if (removedIds.has(selectedCardId ?? "")) selectedCardId = fallbackId;
  if (removedIds.has(focusedCardId ?? "")) focusedCardId = fallbackId;
}

/** Reports removed iteration content; the drafts/artifacts owner decides what to release. */
function releaseUnusedIteration(card: CanvasCard, remaining: readonly CanvasCard[] = cards): void {
  if (!iterationId(card.content)) return;
  frameLifecycle().release(card.content, remaining.map((candidate) => candidate.content));
}

function recordRemoval(before: readonly CanvasCard[], removed: CanvasCard): void {
  let snapshot = removed;
  recordCanvasChange({
    cardIds: [removed.id],
    undo: () => {
      cards = reinsertInRecordedOrder(cards, before.map((card) => card.id === removed.id ? snapshot : card), new Set([removed.id]));
      selectCard(removed.id);
      activateHistoryCard(removed.id);
      focusCanvasCards([removed.id]);
    },
    redo: () => {
      snapshot = cards.find((card) => card.id === removed.id) ?? snapshot;
      cards = cards.filter((card) => card.id !== removed.id);
      selectFallbackAfterRemoval(new Set([removed.id]));
      notify();
    },
    dispose: () => releaseUnusedIteration(snapshot),
  });
}

export function removeCanvasCard(id: string, { undoable = false }: { undoable?: boolean } = {}): void {
  if (!frameLifecycle().canEdit()) return;
  const removed = cards.find((card) => card.id === id);
  if (!removed) return;
  const before = cards;
  if (!undoable) discardCanvasHistory(id);
  cards = cards.filter((c) => c.id !== id);
  selectFallbackAfterRemoval(new Set([id]));
  if (undoable) recordRemoval(before, removed);
  notify();
  if (!undoable) releaseUnusedIteration(removed);
}

/** Opens one editor target without replacing restored cards or their dimensions. */
export function activateIframeWorkspace(
  url: string,
  viewport: { width: number; height: number },
  options: { replaceActiveCard?: boolean; preserveIterationFocus?: boolean } = {},
): CanvasCard | null {
  const normalized = normalizeUrl(url);
  if (!normalized || normalized.origin !== window.location.origin) return null;
  const targetHref = new URL(url).href;

  setCanvasMode("canvas");
  const active = cards.find((card) => card.id === (selectedCardId ?? focusedCardId));
  if (options.preserveIterationFocus && active?.content.kind === "iteration") {
    const sourceRoute = normalizeUrl(active.content.sourceUrl);
    if (sourceRoute && normalizedUrlKey(sourceRoute) === normalizedUrlKey(normalized)) {
      focusedCardId = active.id;
      selectedCardId = active.id;
      notify();
      return active;
    }
  }
  if (options.replaceActiveCard && active && !iterationId(active.content)) {
    const oldRoute = normalizeUrl(contentSourceUrl(active.content));
    const changedRoute = !oldRoute || normalizedUrlKey(oldRoute) !== normalizedUrlKey(normalized);
    const next = {
      ...active,
      content: { kind: "route" as const, url: targetHref, ...(contentSourceUrl(active.content) !== targetHref ? { navigationUrl: targetHref } : {}) },
      ...(changedRoute ? { title: null, entrance: undefined } : {}),
    };
    cards = cards.map((card) => card.id === active.id ? next : card);
    focusedCardId = active.id;
    selectedCardId = active.id;
    notify();
    return next;
  }
  const focused = cards.find((card) => card.id === focusedCardId);
  const focusedUrl = focused?.content.kind === "route" ? normalizeUrl(focused.content.url) : null;
  const existing = focused && focusedUrl
    && normalizedUrlKey(focusedUrl) === normalizedUrlKey(normalized)
    ? focused
    : cards.find((card) => card.content.kind === "route" && card.content.url === targetHref) ?? findCardByNormalizedUrl(normalized);
  if (existing) {
    let activated = existing;
    if (contentSourceUrl(existing.content) !== targetHref) {
      activated = { ...existing, content: { kind: "route", url: targetHref, navigationUrl: targetHref } };
      cards = cards.map((card) => card.id === existing.id ? activated : card);
    }
    focusedCardId = existing.id;
    selectedCardId = existing.id;
    notify();
    return activated;
  }

  if (cards.length === 0) {
    const width = Math.max(200, viewport.width - PRIMARY_CARD_INSET * 2);
    const height = Math.max(150, viewport.height - PRIMARY_CARD_INSET * 2);
    const card: CanvasCard = {
      id: `card-${++cardIdCounter}`,
      content: { kind: "route", url: targetHref },
      title: null,
      x: 0,
      y: 0,
      width,
      height,
    };
    cards = [card];
    lastUsedCardSize = { width, height };
    focusedCardId = card.id;
    selectedCardId = card.id;
    placeBoardCamera({ x: PRIMARY_CARD_INSET, y: PRIMARY_CARD_INSET, zoom: 1 });
    notify();
    return card;
  }

  const card = addCanvasCard(targetHref);
  focusedCardId = card.id;
  selectedCardId = card.id;
  focusCanvasCards([card.id], viewport);
  return card;
}

export function updateCardTitle(id: string, title: string): void {
  cards = cards.map((c) => (c.id === id ? { ...c, title } : c));
  notify();
}

export function updateCardUrl(id: string, url: string): void {
  cards = cards.map((c) => (c.id === id && c.content.kind === "route" ? { ...c, content: { ...c.content, url } } : c));
  notify();
}

export function duplicateCard(sourceId: string): CanvasCard | null {
  const before = cards;
  const source = cards.find((c) => c.id === sourceId);
  if (!source || source.content.kind !== "route") return null;
  const size = lastUsedCardSize ?? { width: source.width, height: source.height };
  const card: CanvasCard = {
    id: `card-${++cardIdCounter}`,
    content: { kind: "route", url: source.content.url },
    entrance: "linked",
    title: source.title,
    x: source.x + source.width + CARD_GAP,
    y: source.y,
    width: size.width,
    height: size.height,
  };
  const index = cards.indexOf(source);
  cards = [...cards.slice(0, index + 1), card, ...cards.slice(index + 1)];
  cards = pushOverlappingCards(cards, new Set([source.id, card.id]), CARD_GAP);
  lastUsedCardSize = { width: size.width, height: size.height };
  recordCreation(before, [card]);
  notify();
  return cards.find((c) => c.id === card.id)!;
}

export function findCardByArtifactId(artifactId: string): CanvasCard | undefined {
  return cards.find((card) => card.content.kind === "iteration" && card.content.artifactId === artifactId);
}

/** Adds an existing HTML iteration as its own card, or returns the frame already showing it. */
export function addCanvasArtifact(artifact: HtmlArtifactMetadata): CanvasCard {
  const existing = findCardByArtifactId(artifact.id);
  if (existing) return existing;
  const before = cards;
  const pos = nextCardPosition(cards, CARD_GAP);
  const card: CanvasCard = {
    id: `card-${++cardIdCounter}`,
    content: { kind: "iteration", artifactId: artifact.id, sourceUrl: artifact.sourceUrl },
    title: artifact.title || null,
    x: pos.x,
    y: pos.y,
    width: Math.max(320, Math.round(artifact.viewport.width)),
    height: Math.max(240, Math.round(artifact.viewport.height)),
    entrance: "iteration",
    animateEntrance: false,
  };
  cards = [...cards, card];
  lastUsedCardSize = { width: card.width, height: card.height };
  recordCreation(before, [card]);
  notify();
  return card;
}

export function addCanvasIteration(sourceId: string, artifactId: string, position?: { x: number; y: number }, animateEntrance = true): CanvasCard | null {
  const before = cards;
  const source = cards.find((card) => card.id === sourceId);
  if (!source) return null;
  const { x, y } = position ?? iterationPosition(cards, source, CARD_GAP);
  const iteration: CanvasCard = {
    id: `card-${++cardIdCounter}`, content: { kind: "iteration", sourceUrl: contentSourceUrl(source.content), artifactId }, title: source.title,
    width: source.width, height: source.height, x, y, entrance: "iteration", animateEntrance,
  };
  cards = [...cards, iteration];
  recordCreation(before, [iteration]);
  notify();
  return iteration;
}

export function resizeCard(
  id: string,
  width: number,
  height: number,
  position?: { readonly x: number; readonly y: number },
): void {
  cards = cards.map((c) => (c.id === id
    ? { ...c, width, height, ...(position ? { x: position.x, y: position.y } : {}) }
    : c));
  lastUsedCardSize = { width, height };
  notify();
}

export function fitAllCards(viewport?: { width: number; height: number }): void {
  const bounds = selectedBounds(cards.map((card) => card.id));
  if (!bounds) return;
  placeBoardCamera(fitCamera(bounds, viewport ?? windowViewport(), FIT_ALL_PADDING) ?? DEFAULT_CAMERA);
}

/** Centers the cards without changing the current zoom. */
export function focusCanvasCards(
  cardIds: readonly string[],
  viewport?: { width: number; height: number },
): boolean {
  const bounds = selectedBounds(cardIds);
  if (!bounds) return false;
  placeBoardCamera(centerCamera(bounds, getBoardCamera().zoom, viewport ?? windowViewport()));
  return true;
}

function selectedBounds(cardIds: readonly string[]): Bounds | null {
  const selectedIds = new Set(cardIds);
  const selected = cards.filter((card) => selectedIds.has(card.id));
  return selected.length ? boundsOf(selected) : null;
}

function windowViewport(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight };
}

export function findCardByNormalizedUrl(
  normalized: NormalizedUrl,
): CanvasCard | undefined {
  return cards.find((c) => {
    if (c.content.kind !== "route") return false;
    const n = normalizeUrl(c.content.url);
    if (!n) return false;
    return normalizedUrlKey(n) === normalizedUrlKey(normalized);
  });
}

export function focusCard(id: string): void {
  focusedCardId = id;
  selectedCardId = id;
  notify();
}

export function getFocusedCardId(): string | null {
  return focusedCardId;
}

export function selectCard(id: string): void {
  focusedCardId = id;
  selectedCardId = id;
  notify();
}

export function deselectCard(): void {
  selectedCardId = null;
  notify();
}

export function getSelectedCardId(): string | null {
  return selectedCardId;
}

export function useSelectedCardId(): string | null {
  return useSyncExternalStore(subscribe, getSelectedCardId, getSelectedCardId);
}

export function useFocusedCardId(): string | null {
  return useSyncExternalStore(subscribe, getFocusedCardId, getFocusedCardId);
}

export function setCardPosition(id: string, x: number, y: number): void {
  cards = cards.map((c) => (c.id === id ? { ...c, x, y } : c));
  notify();
}

function cardGeometry(id: string): FrameGeometry | null {
  const card = cards.find((candidate) => candidate.id === id);
  return card ? { x: card.x, y: card.y, width: card.width, height: card.height } : null;
}

/** The returned commit records the whole gesture as one undo step; programmatic placement stays out of history. */
export function beginCardGeometryChange(id: string): () => void {
  const before = cardGeometry(id);
  let committed = false;
  return () => {
    if (committed || !before) return;
    committed = true;
    const after = cardGeometry(id);
    if (!after || (after.x === before.x && after.y === before.y && after.width === before.width && after.height === before.height)) return;
    const restore = (geometry: FrameGeometry) => {
      if (!cards.some((card) => card.id === id)) return;
      cards = cards.map((card) => card.id === id ? { ...card, ...geometry } : card);
      selectCard(id);
      activateHistoryCard(id);
    };
    recordCanvasChange({
      cardIds: [id],
      undo: () => restore(before),
      redo: () => restore(after),
      dispose: () => undefined,
    });
  };
}

export function hydrateCanvasStore(
  newMode: CanvasMode,
  newCards: CanvasCard[],
  newCamera: CanvasCamera,
  restoredFocusedCardId: string | null = null,
  restoredPresentation: CanvasPresentation = "focus",
): void {
  cards = newCards;
  focusedCardId = newCards.some((card) => card.id === restoredFocusedCardId)
    ? restoredFocusedCardId
    : null;
  selectedCardId = null;
  const lastCard = newCards.at(-1);
  lastUsedCardSize = lastCard
    ? { width: lastCard.width, height: lastCard.height }
    : null;
  if (newCards.length > 0) {
    let maxNum = 0;
    for (const c of newCards) {
      const match = /^card-(\d+)$/.exec(c.id);
      if (match) {
        const n = Number(match[1]);
        if (n > maxNum) maxNum = n;
      }
    }
    cardIdCounter = Math.max(cardIdCounter, maxNum);
  }
  restoreCanvasView({ mode: newMode, presentation: restoredPresentation, camera: newCamera });
  notify();
}

export {
  subscribe,
  getCards,
  getCards as getCanvasCards,
};

export function useCanvasCards(): CanvasCard[] {
  return useSyncExternalStore(subscribe, getCards, getCards);
}

function frameRoute(card: CanvasCard): { key: string; label: string } {
  const sourceUrl = contentSourceUrl(card.content);
  const normalized = normalizeUrl(sourceUrl);
  if (!normalized) return { key: sourceUrl, label: sourceUrl };
  return {
    key: `${normalized.origin}${normalized.pathname}`,
    label: normalized.pathname,
  };
}

export function getCanvasCardLabel(card: CanvasCard, frameCards: readonly CanvasCard[] = cards): string {
  const route = frameRoute(card);
  const candidates = frameCards.some((candidate) => candidate.id === card.id) ? frameCards : [...frameCards, card];
  const matchingFrames = candidates.filter((candidate) => frameRoute(candidate).key === route.key);
  const matchingKind = matchingFrames.filter((candidate) => candidate.content.kind === card.content.kind);
  const number = matchingKind.findIndex((candidate) => candidate.id === card.id) + 1;

  if (card.content.kind === "iteration") return `${route.label} · Iteration ${number}`;
  return number === 1 ? route.label : `${route.label} · Copy ${number}`;
}
