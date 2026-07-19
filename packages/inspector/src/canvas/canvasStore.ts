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
}

export interface CanvasCamera {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_CAMERA_ZOOM = 0.1;
export const MAX_CAMERA_ZOOM = 3;
export const CARD_GAP = 40;
export const FIT_ALL_PADDING = 80;

const DEFAULT_CAMERA: CanvasCamera = { x: 0, y: 0, zoom: 1 };

function defaultViewportSize(): { width: number; height: number } {
  return {
    width: window.innerWidth || 1024,
    height: window.innerHeight || 768,
  };
}

let mode: CanvasMode = "inspect";
let cards: CanvasCard[] = [];
let focusedCardId: string | null = null;
let cardIdCounter = 0;
let boardCamera: CanvasCamera = { ...DEFAULT_CAMERA };
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

function notify(): void {
  listeners.forEach((l) => l());
}

function computeNewCardPosition(existingCards: CanvasCard[], gap: number): { x: number; y: number } {
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
    boardCamera = { ...DEFAULT_CAMERA };
    fitAllRan = false;
  }
  notify();
}

export function exitCanvas(): void {
  if (mode === "inspect") return;
  mode = "inspect";
  notify();
}

export function addCanvasCard(url: string, title?: string): CanvasCard {
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
  };
  cards = [...cards, card];
  lastUsedCardSize = { width: size.width, height: size.height };
  notify();
  return card;
}

export function removeCanvasCard(id: string): void {
  cards = cards.filter((c) => c.id !== id);
  if (cards.length === 0 && mode === "canvas") {
    mode = "inspect";
  }
  notify();
}

export function updateCardTitle(id: string, title: string): void {
  cards = cards.map((c) => (c.id === id ? { ...c, title } : c));
  notify();
}

export function updateCardUrl(id: string, url: string): void {
  cards = cards.map((c) => (c.id === id ? { ...c, url } : c));
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
  return { ...boardCamera };
}

export function setBoardCamera(camera: CanvasCamera): void {
  boardCamera = {
    x: camera.x,
    y: camera.y,
    zoom: Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, camera.zoom)),
  };
  notify();
}

export function updateBoardCamera(partial: Partial<CanvasCamera>): void {
  const next: CanvasCamera = { ...boardCamera, ...partial };
  if (partial.zoom !== undefined) {
    next.zoom = Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, partial.zoom));
  }
  boardCamera = next;
  notify();
}

export function fitAllCards(): void {
  if (cards.length === 0) return;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const card of cards) {
    if (card.x < minX) minX = card.x;
    if (card.y < minY) minY = card.y;
    if (card.x + card.width > maxX) maxX = card.x + card.width;
    if (card.y + card.height > maxY) maxY = card.y + card.height;
  }

  const contentW = maxX - minX;
  const contentH = maxY - minY;

  if (contentW <= 0 || contentH <= 0) {
    boardCamera = { ...DEFAULT_CAMERA };
    fitAllRan = true;
    notify();
    return;
  }

  const viewW = window.innerWidth - FIT_ALL_PADDING * 2;
  const viewH = window.innerHeight - FIT_ALL_PADDING * 2;

  const zoomX = viewW / contentW;
  const zoomY = viewH / contentH;
  const zoom = Math.min(zoomX, zoomY, MAX_CAMERA_ZOOM);

  const contentCenterX = minX + contentW / 2;
  const contentCenterY = minY + contentH / 2;

  boardCamera = {
    x: -(contentCenterX * zoom) + window.innerWidth / 2,
    y: -(contentCenterY * zoom) + window.innerHeight / 2,
    zoom,
  };
  fitAllRan = true;
  notify();
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
  notify();
}

export function getFocusedCardId(): string | null {
  return focusedCardId;
}

export function setCardPosition(id: string, x: number, y: number): void {
  cards = cards.map((c) => (c.id === id ? { ...c, x, y } : c));
  notify();
}

export function hydrateCanvasStore(
  newMode: CanvasMode,
  newCards: CanvasCard[],
  newCamera: CanvasCamera,
): void {
  mode = newMode;
  cards = [...newCards];
  focusedCardId = null;
  boardCamera = { ...newCamera };
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

export { subscribe, getMode, getCards, getMode as getCanvasMode, getCards as getCanvasCards };

export function useCanvasMode(): CanvasMode {
  return useSyncExternalStore(subscribe, getMode, getMode);
}

export function useCanvasCards(): CanvasCard[] {
  return useSyncExternalStore(subscribe, getCards, getCards);
}

export function useBoardCamera(): CanvasCamera {
  return useSyncExternalStore(subscribe, getBoardCamera, getBoardCamera);
}
