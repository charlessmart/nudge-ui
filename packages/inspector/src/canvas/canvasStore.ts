import { useSyncExternalStore } from "react";
import { normalizeUrl, normalizedUrlKey, type NormalizedUrl } from "./normalizeUrl.ts";

export type CanvasMode = "inspect" | "canvas";

export interface CanvasCard {
  id: string;
  url: string;
  title: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  /** The agent-created comparison group that owns this card, when present. */
  comparisonGroupId?: string;
}

/** A durable, agent-owned collection of Canvas cards. */
export interface CanvasComparisonGroup {
  id: string;
  label: string;
  /** Public protocol marker. Canvas currently exposes only agent-created groups. */
  owner: "agent";
  /** Pairing identity used to authorize removal of this group. */
  agentId: string;
  cardIds: string[];
  routes: CanvasComparisonGroupRoute[];
}

export interface CanvasComparisonGroupRoute {
  url: string;
  title?: string | null;
  label?: string;
}

export interface CanvasCamera {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_CAMERA_ZOOM = 0.25;
export const MAX_CAMERA_ZOOM = 3;
export const CARD_GAP = 40;
export const FIT_ALL_PADDING = 80;

const DEFAULT_CAMERA: CanvasCamera = { x: 0, y: 0, zoom: 1 };

function defaultViewportSize() {
  return {
    width: window.innerWidth || 1024,
    height: window.innerHeight || 768,
  };
}

let mode: CanvasMode = "inspect";
let cards: CanvasCard[] = [];
let comparisonGroups: CanvasComparisonGroup[] = [];
let focusedCardId: string | null = null;
let selectedCardId: string | null = null;
let cardIdCounter = 0;
let cachedBoardCamera: CanvasCamera = { ...DEFAULT_CAMERA };
let lastUsedCardSize: { width: number; height: number } | null = null;
let fitAllRan = false;
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getMode(): CanvasMode {
  return mode;
}

function getCards(): CanvasCard[] {
  return cards;
}

function getComparisonGroups(): CanvasComparisonGroup[] {
  return comparisonGroups;
}

function notify(): void {
  listeners.forEach((l) => l());
}

function computeNewCardPosition(existingCards: CanvasCard[], gap: number) {
  if (existingCards.length === 0) return { x: 0, y: 0 };
  let rightmostEdge = -Infinity;
  for (const c of existingCards) {
    const edge = c.x + c.width + gap;
    if (edge > rightmostEdge) rightmostEdge = edge;
  }
  const rowY = existingCards[0]!.y;
  return { x: rightmostEdge, y: rowY };
}

export function setCanvasMode(newMode: CanvasMode): void {
  if (mode === newMode) return;
  mode = newMode;
  notify();
}

export function enterCanvas(): void {
  if (mode === "canvas") return;
  mode = "canvas";
  if (cards.length === 0) {
    const size = lastUsedCardSize ?? defaultViewportSize();
    const card: CanvasCard = {
      id: `card-${++cardIdCounter}`,
      url: window.location.href,
      title: document.title,
      x: 0,
      y: 0,
      width: size.width,
      height: size.height,
    };
    cards = [card];
    lastUsedCardSize = { width: size.width, height: size.height };
    cachedBoardCamera = { ...DEFAULT_CAMERA };
    fitAllRan = false;
  } else {
    const currentRoute = normalizeUrl(window.location.href);
    const existing = currentRoute ? findCardByNormalizedUrl(currentRoute) : undefined;
    if (existing) {
      focusCard(existing.id);
    } else {
      const added = addCanvasCard(window.location.href, document.title);
      focusCard(added.id);
      fitAllRan = false;
    }
  }
  notify();
}

export function exitCanvas(): void {
  if (mode === "inspect") return;
  mode = "inspect";
  notify();
}

/** Return to inspect mode on a canvas card's route. */
export function exitCanvasToCard(card: CanvasCard): void {
  exitCanvas();
  resetFitAllFlag();
  if (card.url !== window.location.href) {
    window.location.href = card.url;
  }
}

export function addCanvasCard(url: string, title?: string): CanvasCard {
  return addCanvasCardWithOptions(url, title);
}

export interface AddCanvasCardOptions {
  comparisonGroupId?: string;
}

/** Adds one card while retaining the existing placement policy. */
export function addCanvasCardWithOptions(
  url: string,
  title?: string,
  options: AddCanvasCardOptions = {},
): CanvasCard {
  const size = lastUsedCardSize ?? defaultViewportSize();
  const pos = computeNewCardPosition(cards, CARD_GAP);
  const card: CanvasCard = {
    id: `card-${++cardIdCounter}`,
    url,
    title: title ?? null,
    x: pos.x,
    y: pos.y,
    width: size.width,
    height: size.height,
    ...(options.comparisonGroupId ? { comparisonGroupId: options.comparisonGroupId } : {}),
  };
  cards = [...cards, card];
  lastUsedCardSize = { width: size.width, height: size.height };
  notify();
  return card;
}

/**
 * Appends an agent-created comparison group without disturbing existing cards.
 * Callers validate route URLs and labels at the command boundary; this store
 * function only enforces the durable identity and placement invariants.
 */
export function appendCanvasComparisonGroup(input: {
  id: string;
  label: string;
  agentId: string;
  owner?: "agent";
  routes: readonly CanvasComparisonGroupRoute[];
}): { group: CanvasComparisonGroup; cards: CanvasCard[] } | null {
  if (!input.id || !input.label || !input.agentId || input.routes.length === 0) return null;
  if (comparisonGroups.some((group) => group.id === input.id)) return null;

  const nextCards: CanvasCard[] = [];
  let nextCardsSnapshot = cards;
  for (const route of input.routes) {
    const size = lastUsedCardSize ?? defaultViewportSize();
    const pos = computeNewCardPosition(nextCardsSnapshot, CARD_GAP);
    const card: CanvasCard = {
      id: `card-${++cardIdCounter}`,
      url: route.url,
      title: route.title ?? null,
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: size.height,
      comparisonGroupId: input.id,
    };
    nextCards.push(card);
    nextCardsSnapshot = [...nextCardsSnapshot, card];
    lastUsedCardSize = { width: size.width, height: size.height };
  }

  const group: CanvasComparisonGroup = {
    id: input.id,
    label: input.label,
    owner: "agent",
    agentId: input.agentId,
    cardIds: nextCards.map((card) => card.id),
    routes: input.routes.map((route) => ({ ...route })),
  };
  cards = [...cards, ...nextCards];
  comparisonGroups = [...comparisonGroups, group];
  notify();
  return { group, cards: nextCards };
}

export function getCanvasComparisonGroup(id: string): CanvasComparisonGroup | undefined {
  return comparisonGroups.find((group) => group.id === id);
}

/** Removes a group and exactly the cards owned by that group. */
export function removeCanvasComparisonGroup(id: string): CanvasComparisonGroup | null {
  const group = getCanvasComparisonGroup(id);
  if (!group) return null;
  const groupCardIds = new Set(group.cardIds);
  cards = cards.filter((card) => !groupCardIds.has(card.id));
  comparisonGroups = comparisonGroups.filter((candidate) => candidate.id !== id);
  if (groupCardIds.has(selectedCardId ?? "")) selectedCardId = null;
  if (groupCardIds.has(focusedCardId ?? "")) focusedCardId = null;
  if (cards.length === 0 && mode === "canvas") mode = "inspect";
  notify();
  return group;
}

/** Clears group metadata while leaving ordinary cards intact. */
export function clearCanvasComparisonGroups(): void {
  if (comparisonGroups.length === 0 && !cards.some((card) => card.comparisonGroupId)) return;
  cards = cards.map(({ comparisonGroupId: _comparisonGroupId, ...card }) => card);
  comparisonGroups = [];
  notify();
}

export function removeCanvasCard(id: string): void {
  const removed = cards.find((card) => card.id === id);
  cards = cards.filter((c) => c.id !== id);
  if (selectedCardId === id) {
    selectedCardId = null;
  }
  if (focusedCardId === id) {
    focusedCardId = null;
  }
  if (removed?.comparisonGroupId) {
    comparisonGroups = comparisonGroups
      .map((group) => {
        if (group.id !== removed.comparisonGroupId) return group;
        const routeIndex = group.cardIds.indexOf(id);
        if (routeIndex < 0) return group;
        return {
          ...group,
          cardIds: group.cardIds.filter((_cardId, index) => index !== routeIndex),
          routes: group.routes.filter((_route, index) => index !== routeIndex),
        };
      })
      .filter((group) => group.cardIds.length > 0);
  }
  if (cards.length === 0 && mode === "canvas") {
    mode = "inspect";
  }
  notify();
}

export function updateCardTitle(id: string, title: string): void {
  const card = cards.find((candidate) => candidate.id === id);
  cards = cards.map((c) => (c.id === id ? { ...c, title } : c));
  if (card?.comparisonGroupId) {
    comparisonGroups = comparisonGroups.map((group) => {
      if (group.id !== card.comparisonGroupId) return group;
      const routeIndex = group.cardIds.indexOf(id);
      if (routeIndex < 0) return group;
      return {
        ...group,
        routes: group.routes.map((route, index) => index === routeIndex ? { ...route, title } : route),
      };
    });
  }
  notify();
}

export function updateCardUrl(id: string, url: string): void {
  const card = cards.find((candidate) => candidate.id === id);
  cards = cards.map((c) => (c.id === id ? { ...c, url } : c));
  if (card?.comparisonGroupId) {
    comparisonGroups = comparisonGroups.map((group) => {
      if (group.id !== card.comparisonGroupId) return group;
      const routeIndex = group.cardIds.indexOf(id);
      if (routeIndex < 0) return group;
      return {
        ...group,
        routes: group.routes.map((route, index) => index === routeIndex ? { ...route, url } : route),
      };
    });
  }
  notify();
}

export function duplicateCard(sourceId: string): CanvasCard | null {
  const source = cards.find((c) => c.id === sourceId);
  if (!source) return null;
  const size = lastUsedCardSize ?? { width: source.width, height: source.height };
  const pos = computeNewCardPosition(cards, CARD_GAP);
  const card: CanvasCard = {
    id: `card-${++cardIdCounter}`,
    url: source.url,
    title: source.title,
    x: pos.x,
    y: pos.y,
    width: size.width,
    height: size.height,
  };
  cards = [...cards, card];
  lastUsedCardSize = { width: size.width, height: size.height };
  notify();
  return card;
}

export function resizeCard(id: string, width: number, height: number): void {
  cards = cards.map((c) => (c.id === id ? { ...c, width, height } : c));
  lastUsedCardSize = { width, height };
  notify();
}

export function getBoardCamera(): CanvasCamera {
  return cachedBoardCamera;
}

export function setBoardCamera(camera: CanvasCamera): void {
  cachedBoardCamera = {
    x: camera.x,
    y: camera.y,
    zoom: Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, camera.zoom)),
  };
  notify();
}

export function updateBoardCamera(partial: Partial<CanvasCamera>): void {
  const next: CanvasCamera = { ...cachedBoardCamera, ...partial };
  if (partial.zoom !== undefined) {
    next.zoom = Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, partial.zoom));
  }
  cachedBoardCamera = next;
  notify();
}

export function fitAllCards(viewport?: { width: number; height: number }): void {
  fitCanvasCards(cards.map((card) => card.id), viewport);
}

/** Fits a selected set of cards while preserving cards outside that set. */
export function fitCanvasCards(
  cardIds: readonly string[],
  viewport?: { width: number; height: number },
): boolean {
  const selectedIds = new Set(cardIds);
  const selectedCards = cards.filter((card) => selectedIds.has(card.id));
  if (selectedCards.length === 0) return false;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const card of selectedCards) {
    if (card.x < minX) minX = card.x;
    if (card.y < minY) minY = card.y;
    if (card.x + card.width > maxX) maxX = card.x + card.width;
    if (card.y + card.height > maxY) maxY = card.y + card.height;
  }

  const contentW = maxX - minX;
  const contentH = maxY - minY;

  if (contentW <= 0 || contentH <= 0) {
    cachedBoardCamera = { ...DEFAULT_CAMERA };
    fitAllRan = true;
    notify();
    return true;
  }

  const viewW = Math.max(1, (viewport?.width ?? window.innerWidth) - FIT_ALL_PADDING * 2);
  const viewH = Math.max(1, (viewport?.height ?? window.innerHeight) - FIT_ALL_PADDING * 2);

  const zoomX = viewW / contentW;
  const zoomY = viewH / contentH;
  const zoom = Math.max(MIN_CAMERA_ZOOM, Math.min(zoomX, zoomY, MAX_CAMERA_ZOOM));

  const contentCenterX = minX + contentW / 2;
  const contentCenterY = minY + contentH / 2;

  cachedBoardCamera = {
    x: -(contentCenterX * zoom) + (viewport?.width ?? window.innerWidth) / 2,
    y: -(contentCenterY * zoom) + (viewport?.height ?? window.innerHeight) / 2,
    zoom,
  };
  fitAllRan = true;
  notify();
  return true;
}

/** Centers a selected set of cards without changing the current zoom. */
export function focusCanvasCards(
  cardIds: readonly string[],
  viewport?: { width: number; height: number },
): boolean {
  const selectedIds = new Set(cardIds);
  const selectedCards = cards.filter((card) => selectedIds.has(card.id));
  if (selectedCards.length === 0) return false;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const card of selectedCards) {
    minX = Math.min(minX, card.x);
    minY = Math.min(minY, card.y);
    maxX = Math.max(maxX, card.x + card.width);
    maxY = Math.max(maxY, card.y + card.height);
  }

  const viewW = viewport?.width ?? window.innerWidth;
  const viewH = viewport?.height ?? window.innerHeight;
  const contentCenterX = minX + (maxX - minX) / 2;
  const contentCenterY = minY + (maxY - minY) / 2;
  cachedBoardCamera = {
    x: -(contentCenterX * cachedBoardCamera.zoom) + viewW / 2,
    y: -(contentCenterY * cachedBoardCamera.zoom) + viewH / 2,
    zoom: cachedBoardCamera.zoom,
  };
  fitAllRan = true;
  notify();
  return true;
}

export function hasFitAllRan(): boolean {
  return fitAllRan;
}

export function resetFitAllFlag(): void {
  fitAllRan = false;
}

export function findCardByNormalizedUrl(
  normalized: NormalizedUrl,
): CanvasCard | undefined {
  return cards.find((c) => {
    const n = normalizeUrl(c.url);
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
  newComparisonGroups: CanvasComparisonGroup[] = [],
): void {
  mode = newMode;
  cards = newCards.map((card) => ({ ...card }));
  comparisonGroups = newComparisonGroups.map((group) => ({
    ...group,
    owner: "agent",
    cardIds: [...group.cardIds],
    routes: group.routes.map((route) => ({ ...route })),
  }));
  focusedCardId = null;
  selectedCardId = null;
  cachedBoardCamera = { ...newCamera };
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
  fitAllRan = true;
  notify();
}

export {
  subscribe,
  getMode,
  getCards,
  getComparisonGroups,
  getMode as getCanvasMode,
  getCards as getCanvasCards,
  getComparisonGroups as getCanvasComparisonGroups,
};

export function useCanvasMode(): CanvasMode {
  return useSyncExternalStore(subscribe, getMode, getMode);
}

export function useCanvasCards(): CanvasCard[] {
  return useSyncExternalStore(subscribe, getCards, getCards);
}

export function useCanvasComparisonGroups(): CanvasComparisonGroup[] {
  return useSyncExternalStore(subscribe, getComparisonGroups, getComparisonGroups);
}

export function useBoardCamera(): CanvasCamera {
  return useSyncExternalStore(subscribe, getBoardCamera, getBoardCamera);
}
