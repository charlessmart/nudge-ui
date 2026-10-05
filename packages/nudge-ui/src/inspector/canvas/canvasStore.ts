import type { FrameContent } from "./frameContent.ts";
import { iterationId, contentSourceUrl } from "./frameContent.ts";
import { recordCanvasCreation, discardCanvasHistory, isDraftLocked } from "../changes/draftChanges.ts";
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
import { removeHtmlArtifact } from "../iterations/client.ts";
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
  groupId?: string;
  title: string | null;
}

export interface FrameGroup {
  readonly id: string;
  readonly kind: "agent";
  readonly label: string;
  readonly agentId: string;
  readonly routes: readonly { url: string; title?: string; label?: string }[];
}

const frameGroups = new Map<string, FrameGroup>();
export function setFrameGroup(group: FrameGroup): void { frameGroups.set(group.id, group); }
export function getFrameGroup(id: string): FrameGroup | undefined { return frameGroups.get(id); }
export function removeFrameGroup(id: string): void { frameGroups.delete(id); }
export function getFrameGroups(): readonly FrameGroup[] {
  return [...frameGroups.values()].filter((group) => cards.some((card) => card.groupId === group.id));
}

export function isFrameGroup(value: unknown): value is FrameGroup {
  if (!value || typeof value !== "object") return false;
  const group = value as FrameGroup;
  if (typeof group.id !== "string" || group.id.length > 256) return false;
  return group.kind === "agent" && typeof group.label === "string" && typeof group.agentId === "string"
    && Array.isArray(group.routes) && group.routes.every((route: { url?: unknown }) => {
      try { return typeof route.url === "string" && new URL(route.url).origin === window.location.origin; } catch { return false; }
    });
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

/** Adds one card while retaining the existing placement policy. */
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

export function appendAgentRouteCards(
  groupId: string,
  routes: readonly { url: string; title?: string | null }[],
): CanvasCard[] | null {
  if (!groupId || routes.length === 0) return null;

  const before = cards;
  const nextCards: CanvasCard[] = [];
  let nextCardsSnapshot = cards;
  for (const route of routes) {
    const size = lastUsedCardSize ?? defaultViewportSize();
    const pos = nextCardPosition(nextCardsSnapshot, CARD_GAP);
    const card: CanvasCard = {
      id: `card-${++cardIdCounter}`,
      content: { kind: "route", url: route.url },
      title: route.title ?? null,
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: size.height,
      groupId: groupId,
    };
    nextCards.push(card);
    nextCardsSnapshot = [...nextCardsSnapshot, card];
    lastUsedCardSize = { width: size.width, height: size.height };
  }
  cards = [...cards, ...nextCards];
  recordCreation(before, nextCards);
  notify();
  return nextCards;
}

let activateHistoryCard: (cardId: string) => void = () => undefined;

/** Connects canvas replay to the draft controller without coupling the stores. */
export function setCanvasHistoryActivator(activate: (cardId: string) => void): void {
  activateHistoryCard = activate;
}

function recordCreation(before: readonly CanvasCard[], created: readonly CanvasCard[]): void {
  const createdIds = new Set(created.map((card) => card.id));
  const after = cards.map((card) => ({ ...card }));
  const createdGroups = new Map(created.flatMap((card) => {
    const group = card.groupId ? getFrameGroup(card.groupId) : undefined;
    return group ? [[group.id, group] as const] : [];
  }));
  const oldFocus = selectedCardId ?? focusedCardId ?? before[0]?.id;
  const shifts = layoutShifts(before, cards);
  const restore = (redo: boolean) => {
    if (!redo) {
      // Direct creation drags finish placement after the creation was recorded.
      // Redo must recover the dropped position, dimensions, and loaded title.
      for (const [index, recorded] of after.entries()) {
        const current = createdIds.has(recorded.id) && cards.find((card) => card.id === recorded.id);
        if (current) after[index] = { ...current };
      }
    }
    cards = applyLayoutShifts(cards.filter((card) => !createdIds.has(card.id)), shifts, redo);
    if (redo) cards = reinsertInRecordedOrder(cards, after, createdIds);
    for (const [id, group] of createdGroups) {
      if (!cards.some((card) => card.groupId === id)) removeFrameGroup(id);
      else if (!getFrameGroup(id)) setFrameGroup(group);
    }
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
  recordCanvasCreation({
    cardIds: [...createdIds],
    undo: () => restore(false),
    redo: () => restore(true),
    dispose: () => {
      for (const artifactId of new Set(created.flatMap((card) => card.content.kind === "iteration" ? [card.content.artifactId] : []))) {
        if (!cards.some((card) => iterationId(card.content) === artifactId)) {
          void removeHtmlArtifact(artifactId).catch((error: unknown) => {
            console.warn("Nudge UI could not remove an unused HTML iteration:", error);
          });
        }
      }
    },
  });
}

function selectFallbackAfterRemoval(removedIds: ReadonlySet<string>): void {
  const fallbackId = cards[0]?.id ?? null;
  if (removedIds.has(selectedCardId ?? "")) selectedCardId = fallbackId;
  if (removedIds.has(focusedCardId ?? "")) focusedCardId = fallbackId;
}

export function removeCanvasCard(id: string): void {
  if (isDraftLocked()) return;
  const removedArtifactId = iterationId(cards.find((card) => card.id === id)?.content);
  const removed = cards.find((card) => card.id === id);
  if (!removed) return;
  discardCanvasHistory(id);
  cards = cards.filter((c) => c.id !== id);
  selectFallbackAfterRemoval(new Set([id]));
  notify();
  if (removedArtifactId && !cards.some((card) => iterationId(card.content) === removedArtifactId)) {
    void removeHtmlArtifact(removedArtifactId).catch((error: unknown) => {
      console.warn("Nudge UI could not remove the HTML iteration:", error);
    });
  }
}

/**
 * Opens one editor target in the iframe workspace without replacing restored
 * cards or their dimensions.
 */
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
      ...(changedRoute ? { title: null, groupId: undefined, entrance: undefined } : {}),
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

/** Centers a selected set of cards without changing the current zoom. */
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

export function hydrateCanvasStore(
  newMode: CanvasMode,
  newCards: CanvasCard[],
  newCamera: CanvasCamera,
  restoredFocusedCardId: string | null = null,
  restoredPresentation: CanvasPresentation = "focus",
  restoredGroups: readonly FrameGroup[] = [],
): void {
  frameGroups.clear();
  for (const group of restoredGroups) frameGroups.set(group.id, group);
  cards = newCards.map((card) => ({
    ...card,
    groupId: card.content.kind === "route" && card.groupId && frameGroups.has(card.groupId) ? card.groupId : undefined,
  }));
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

/** Returns a route-based label that distinguishes copies and HTML iterations. */
export function getCanvasCardLabel(card: CanvasCard, frameCards: readonly CanvasCard[] = cards): string {
  const route = frameRoute(card);
  const candidates = frameCards.some((candidate) => candidate.id === card.id) ? frameCards : [...frameCards, card];
  const matchingFrames = candidates.filter((candidate) => frameRoute(candidate).key === route.key);
  const matchingKind = matchingFrames.filter((candidate) => candidate.content.kind === card.content.kind);
  const number = matchingKind.findIndex((candidate) => candidate.id === card.id) + 1;

  if (card.content.kind === "iteration") return `${route.label} · Iteration ${number}`;
  return number === 1 ? route.label : `${route.label} · Copy ${number}`;
}
