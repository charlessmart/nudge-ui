import { recordCanvasCreation, discardCanvasHistory } from "../changes/workspaceChanges.ts";
import { useSyncExternalStore } from "react";
import { normalizeUrl, normalizedUrlKey, type NormalizedUrl } from "./normalizeUrl.ts";
import { removeHtmlArtifact } from "../artifacts/client.ts";

export type CanvasMode = "inspect" | "canvas";
export type CanvasPresentation = "focus" | "canvas";

export interface CanvasCard {
  id: string;
  url: string;
  /** Originating live card. Only these live copies expose Unlink. */
  duplicateOf?: string;
  /** The specific source used to create and animate this variation. */
  variationOf?: string;
  /** Directly placed variations skip entrance animation, including on redo. */
  animateEntrance?: boolean;
  /** A project-local, independently editable HTML study. */
  artifactId?: string;
  /** Live duplicates that share one edit draft and move together. */
  linkedGroupId?: string;
  /** A controller-requested document load. Renderer metadata must not set this. */
  navigationUrl?: string;
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

export const MIN_CAMERA_ZOOM = 0.25;
export const MAX_CAMERA_ZOOM = 3;
export const CARD_GAP = 40;
export const FIT_ALL_PADDING = 80;
export const PRIMARY_CARD_INSET = 40;

const DEFAULT_CAMERA: CanvasCamera = { x: 0, y: 0, zoom: 1 };

function defaultViewportSize() {
  return {
    width: window.innerWidth || 1024,
    height: window.innerHeight || 768,
  };
}

let mode: CanvasMode = "inspect";
let presentation: CanvasPresentation = "focus";
let presentationTransitioning = false;
let layoutTransitioning = false;
let temporaryAppInteraction = false;
let presentationTransitionTimer: number | null = null;
let cards: CanvasCard[] = [];
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

function getPresentation(): CanvasPresentation {
  return presentation;
}

function getPresentationTransitioning(): boolean {
  return presentationTransitioning;
}

/** Shift temporarily enables app interaction without changing the selected tool. */
export function setTemporaryAppInteraction(value: boolean): void {
  if (temporaryAppInteraction === value) return;
  temporaryAppInteraction = value;
  notify();
}

export function useTemporaryAppInteraction(): boolean {
  return useSyncExternalStore(subscribe, () => temporaryAppInteraction, () => temporaryAppInteraction);
}

/** Element interactions pause while frame and camera geometry are animated. */
export function setCanvasLayoutTransitioning(value: boolean): void {
  if (layoutTransitioning === value) return;
  layoutTransitioning = value;
  notify();
}

export function getCanvasLayoutTransitioning(): boolean {
  return layoutTransitioning;
}

export function useCanvasLayoutTransitioning(): boolean {
  return useSyncExternalStore(subscribe, getCanvasLayoutTransitioning, getCanvasLayoutTransitioning);
}

function getCards(): CanvasCard[] {
  return cards;
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

function boundsOf(cards: readonly CanvasCard[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const card of cards) {
    minX = Math.min(minX, card.x);
    minY = Math.min(minY, card.y);
    maxX = Math.max(maxX, card.x + card.width);
    maxY = Math.max(maxY, card.y + card.height);
  }
  return { minX, minY, maxX, maxY };
}

export function setCanvasMode(newMode: CanvasMode): void {
  if (mode === newMode) return;
  mode = newMode;
  notify();
}

/**
 * Changes how the mounted iframe workspace is presented.
 *
 * Canvas starts from the active card centered in the supplied viewport. Card
 * geometry remains durable, but the camera does not carry over from a prior
 * Canvas session.
 */
export function setCanvasPresentation(
  next: CanvasPresentation,
  viewport?: { width: number; height: number },
): void {
  if (presentation === next) return;
  if (next === "canvas") resetCameraToActiveCard(viewport);
  presentation = next;
  presentationTransitioning = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (presentationTransitionTimer !== null) window.clearTimeout(presentationTransitionTimer);
  presentationTransitionTimer = presentationTransitioning
    ? window.setTimeout(() => {
      presentationTransitionTimer = null;
      presentationTransitioning = false;
      notify();
    }, 220)
    : null;
  notify();
}

function resetCameraToActiveCard(viewport?: { width: number; height: number }): void {
  const activeCardId = selectedCardId ?? focusedCardId;
  const activeCard = cards.find((card) => card.id === activeCardId) ?? cards[0];
  if (!activeCard) {
    cachedBoardCamera = { ...DEFAULT_CAMERA };
    return;
  }
  const zoom = 0.9;
  const view = viewport ?? defaultViewportSize();
  cachedBoardCamera = {
    x: view.width / 2 - (activeCard.x + activeCard.width / 2) * zoom,
    y: view.height / 2 - (activeCard.y + activeCard.height / 2) * zoom,
    zoom,
  };
}

/** Adds one card while retaining the existing placement policy. */
export function addCanvasCard(url: string, title?: string): CanvasCard {
  const before = cards;
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
  recordCreation(before, [card]);
  notify();
  return card;
}

/**
 * Appends one card per route, all sharing a durable linked group. Callers
 * validate route URLs at the command boundary; this store function enforces
 * only the placement invariant and group identity.
 */
export function appendLinkedGroupCards(
  groupId: string,
  routes: readonly { url: string; title?: string | null }[],
): CanvasCard[] | null {
  if (!groupId || routes.length === 0) return null;

  const before = cards;
  const nextCards: CanvasCard[] = [];
  let nextCardsSnapshot = cards;
  for (const route of routes) {
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
      linkedGroupId: groupId,
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
  const oldFocus = selectedCardId ?? focusedCardId ?? before[0]?.id;
  // Creation can compact a group and push neighbors. Record only those layout
  // fields, so later title and navigation metadata survive replay.
  const layout = ["x", "y", "linkedGroupId"] as const;
  const previous = new Map(before.map((card) => [card.id, card]));
  const changed = after.filter((card) => {
    const old = previous.get(card.id);
    return old && layout.some((key) => old[key] !== card[key]);
  });
  const restore = (redo: boolean) => {
    if (!redo) {
      // Direct creation drags finish placement after the creation was recorded.
      // Redo must recover the dropped position, dimensions, and loaded title.
      for (let index = 0; index < after.length; index++) {
        const recorded = after[index]!;
        if (!createdIds.has(recorded.id)) continue;
        const current = cards.find((card) => card.id === recorded.id);
        if (current) after[index] = { ...current };
      }
    }
    cards = cards.filter((card) => !createdIds.has(card.id)).map((card) => {
      const next = changed.find((item) => item.id === card.id);
      const old = previous.get(card.id);
      if (!next || !old) return card;
      const target = redo ? next : old;
      return { ...card, x: target.x, y: target.y, linkedGroupId: target.linkedGroupId };
    });
    if (redo) {
      // Preserve the recorded ordering inside linked groups.
      for (const added of after.filter((card) => createdIds.has(card.id))) {
        const index = after.findIndex((card) => card.id === added.id);
        const preceding = after.slice(0, index).reverse().find((card) => cards.some((item) => item.id === card.id));
        const insertion = preceding ? cards.findIndex((card) => card.id === preceding.id) + 1 : 0;
        cards = [...cards.slice(0, insertion), { ...added }, ...cards.slice(insertion)];
      }
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
      for (const artifactId of new Set(created.flatMap((card) => card.artifactId ? [card.artifactId] : []))) {
        if (!cards.some((card) => card.artifactId === artifactId)) {
          void removeHtmlArtifact(artifactId).catch((error: unknown) => {
            console.warn("Nudge UI could not remove an unused HTML study:", error);
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
  const removedArtifactId = cards.find((card) => card.id === id)?.artifactId;
  const removed = cards.find((card) => card.id === id);
  if (!removed) return;
  discardCanvasHistory(id);
  cards = cards.filter((c) => c.id !== id);
  selectFallbackAfterRemoval(new Set([id]));
  if (removed.linkedGroupId) compactLinkedGroup(removed.linkedGroupId);
  notify();
  if (removedArtifactId && !cards.some((card) => card.artifactId === removedArtifactId)) {
    void removeHtmlArtifact(removedArtifactId).catch((error: unknown) => {
      console.warn("Nudge UI could not remove the HTML study:", error);
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
  options: { replaceActiveCard?: boolean } = {},
): CanvasCard | null {
  const normalized = normalizeUrl(url);
  if (!normalized || normalized.origin !== window.location.origin) return null;
  const targetHref = new URL(url).href;

  mode = "canvas";
  const active = cards.find((card) => card.id === (selectedCardId ?? focusedCardId));
  if (options.replaceActiveCard && active && !active.artifactId) {
    const oldRoute = normalizeUrl(active.url);
    const changedRoute = !oldRoute || normalizedUrlKey(oldRoute) !== normalizedUrlKey(normalized);
    const next = {
      ...active,
      url: targetHref,
      ...(active.url !== targetHref ? { navigationUrl: targetHref } : {}),
      ...(changedRoute ? { title: null, linkedGroupId: undefined, duplicateOf: undefined } : {}),
    };
    cards = cards.map((card) => card.id === active.id ? next : card);
    if (changedRoute && active.linkedGroupId) compactLinkedGroup(active.linkedGroupId);
    focusedCardId = active.id;
    selectedCardId = active.id;
    notify();
    return next;
  }
  const focused = cards.find((card) => card.id === focusedCardId);
  const focusedUrl = focused ? normalizeUrl(focused.url) : null;
  const existing = focused && focusedUrl
    && normalizedUrlKey(focusedUrl) === normalizedUrlKey(normalized)
    ? focused
    : cards.find((card) => card.url === targetHref) ?? findCardByNormalizedUrl(normalized);
  if (existing) {
    let activated = existing;
    if (existing.url !== targetHref) {
      activated = { ...existing, url: targetHref, navigationUrl: targetHref };
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
      url: targetHref,
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
    cachedBoardCamera = { x: PRIMARY_CARD_INSET, y: PRIMARY_CARD_INSET, zoom: 1 };
    fitAllRan = true;
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
  cards = cards.map((c) => (c.id === id ? { ...c, url } : c));
  notify();
}

export function duplicateCard(sourceId: string): CanvasCard | null {
  const before = cards;
  const source = cards.find((c) => c.id === sourceId);
  if (!source) return null;
  const size = lastUsedCardSize ?? { width: source.width, height: source.height };
  const linkedGroupId = source.artifactId ? undefined : source.linkedGroupId ?? source.id;
  const card: CanvasCard = {
    id: `card-${++cardIdCounter}`,
    url: source.url,
    duplicateOf: source.artifactId ? undefined : source.id,
    artifactId: source.artifactId,
    linkedGroupId,
    title: source.title,
    x: source.x + source.width + CARD_GAP,
    y: source.y,
    width: size.width,
    height: size.height,
  };
  const index = cards.indexOf(source);
  cards = cards.map((c) => c.id === sourceId ? { ...c, linkedGroupId } : c);
  cards = [...cards.slice(0, index + 1), card, ...cards.slice(index + 1)];
  if (linkedGroupId) compactLinkedGroup(linkedGroupId);
  pushOverlappingCards(new Set(linkedGroupId
    ? cards.filter((c) => c.linkedGroupId === linkedGroupId).map((c) => c.id)
    : [card.id]));
  lastUsedCardSize = { width: size.width, height: size.height };
  recordCreation(before, [card]);
  notify();
  return cards.find((c) => c.id === card.id)!;
}

/** Compacts linked views in their durable order, retaining the group's anchor. */
function compactLinkedGroup(id: string): void {
  const members = cards.filter((c) => c.linkedGroupId === id);
  if (members.length === 0) return;
  let x = Math.min(...members.map((c) => c.x));
  const y = members[0]!.y;
  const positions = new Map<string, number>();
  for (const member of members) {
    positions.set(member.id, x);
    x += member.width + CARD_GAP;
  }
  cards = cards.map((c) => positions.has(c.id)
    ? { ...c, x: positions.get(c.id)!, y, linkedGroupId: members.length > 1 ? id : undefined }
    : c);
}

/** Moves overlapping neighbors right, keeping each linked group intact. */
function pushOverlappingCards(protectedIds: ReadonlySet<string>): void {
  const units: CanvasCard[][] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    const key = card.linkedGroupId ?? card.id;
    if (seen.has(key)) continue;
    seen.add(key);
    units.push(card.linkedGroupId ? cards.filter((c) => c.linkedGroupId === key) : [card]);
  }
  const fixed = units.filter((unit) => unit.some((c) => protectedIds.has(c.id)));
  const moving = units.filter((unit) => !unit.some((c) => protectedIds.has(c.id)))
    .sort((a, b) => boundsOf(a).minX - boundsOf(b).minX);
  for (const unit of moving) {
    let bounds = boundsOf(unit);
    let dx = 0;
    // Check again after a move: another group may occupy the new location.
    let collision = true;
    while (collision) {
      collision = false;
      for (const placed of fixed) {
        const other = boundsOf(placed);
        if (bounds.minY >= other.maxY || bounds.maxY <= other.minY
          || bounds.minX >= other.maxX + CARD_GAP || bounds.maxX + CARD_GAP <= other.minX) continue;
        const shift = other.maxX + CARD_GAP - bounds.minX;
        dx += shift;
        bounds = { ...bounds, minX: bounds.minX + shift, maxX: bounds.maxX + shift };
        collision = true;
      }
    }
    const ids = new Set(unit.map((c) => c.id));
    const moved = unit.map((c) => ({ ...c, x: c.x + dx }));
    if (dx) cards = cards.map((c) => ids.has(c.id) ? { ...c, x: c.x + dx } : c);
    fixed.push(moved);
  }
}

export function moveLinkedGroup(id: string, dx: number, dy: number): void {
  cards = cards.map((card) => card.linkedGroupId === id
    ? { ...card, x: card.x + dx, y: card.y + dy } : card);
  notify();
}

/** Adds an independent HTML variation while retaining its source and linked group. */
export function addCanvasVariation(sourceId: string, artifactId: string, position?: { x: number; y: number }, animateEntrance = true): CanvasCard | null {
  const before = cards;
  const source = cards.find((card) => card.id === sourceId);
  if (!source) return null;
  const group = cards.filter((card) => card.id === sourceId || (source.linkedGroupId && card.linkedGroupId === source.linkedGroupId));
  const x = position?.x ?? source.x;
  let y = position?.y ?? boundsOf(group).maxY + CARD_GAP * 2;
  if (!position) {
    for (const neighbor of [...cards].sort((a, b) => a.y - b.y)) {
      if (x >= neighbor.x + neighbor.width + CARD_GAP || x + source.width + CARD_GAP <= neighbor.x) continue;
      if (y < neighbor.y + neighbor.height + CARD_GAP * 2 && y + source.height + CARD_GAP * 2 > neighbor.y) y = neighbor.y + neighbor.height + CARD_GAP * 2;
    }
  }
  const variation: CanvasCard = {
    id: `card-${++cardIdCounter}`, url: source.url, title: source.title,
    width: source.width, height: source.height, x, y, artifactId, variationOf: sourceId, animateEntrance,
  };
  cards = [...cards, variation];
  recordCreation(before, [variation]);
  notify();
  return variation;
}

/** Detaches a captured study straight down without moving unrelated frames. */
export function setCardArtifact(id: string, artifactId: string): void {
  const original = cards.find((card) => card.id === id);
  if (!original) return;
  cards = cards.map((card) => card.id === id
    ? { ...card, artifactId, duplicateOf: undefined, linkedGroupId: undefined } : card);
  if (original.linkedGroupId) {
    const group = boundsOf(cards.filter((c) => c.id === id || c.linkedGroupId === original.linkedGroupId));
    compactLinkedGroup(original.linkedGroupId);
    let y = group.maxY + CARD_GAP * 2;
    // Continue down the same column if another study already occupies this spot.
    const neighbors = cards.filter((c) => c.id !== id).sort((a, b) => a.y - b.y);
    for (const neighbor of neighbors) {
      if (original.x >= neighbor.x + neighbor.width + CARD_GAP
        || original.x + original.width + CARD_GAP <= neighbor.x) continue;
      if (y < neighbor.y + neighbor.height + CARD_GAP * 2
        && y + original.height + CARD_GAP * 2 > neighbor.y) {
        y = neighbor.y + neighbor.height + CARD_GAP * 2;
      }
    }
    cards = cards.map((c) => c.id === id ? { ...c, y } : c);
  }
  notify();
}

export function resizeCard(
  id: string,
  width: number,
  height: number,
  position?: { readonly x: number; readonly y: number },
): void {
  cards = cards.map((c) => (c.id === id
    ? { ...c, width, height, ...(position && !c.linkedGroupId ? { x: position.x, y: position.y } : {}) }
    : c));
  const resized = cards.find((card) => card.id === id);
  if (resized?.linkedGroupId) {
    compactLinkedGroup(resized.linkedGroupId);
    pushOverlappingCards(new Set(cards.filter((c) => c.linkedGroupId === resized.linkedGroupId).map((c) => c.id)));
  }
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

  const { minX, minY, maxX, maxY } = boundsOf(selectedCards);

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

  const { minX, minY, maxX, maxY } = boundsOf(selectedCards);

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
  if (cards.some((card) => card.id === id && card.linkedGroupId)) return;
  cards = cards.map((c) => (c.id === id ? { ...c, x, y } : c));
  notify();
}

export function hydrateCanvasStore(
  newMode: CanvasMode,
  newCards: CanvasCard[],
  newCamera: CanvasCamera,
  restoredFocusedCardId: string | null = null,
): void {
  mode = newMode;
  cards = newCards.map((card) => ({ ...card, linkedGroupId: card.artifactId ? undefined : card.linkedGroupId }));
  // Older saved duplicates already share a draft; give those live views the
  // same grouping affordance as newly created duplicates.
  for (const card of cards) {
    if (card.artifactId || card.linkedGroupId || !card.duplicateOf) continue;
    let root = card;
    const visited = new Set([card.id]);
    while (root.duplicateOf) {
      const parent = cards.find((candidate) => candidate.id === root.duplicateOf);
      if (!parent || parent.artifactId || visited.has(parent.id)) break;
      visited.add(parent.id);
      root = parent;
    }
    if (root.id === card.id) continue;
    const groupId = root.linkedGroupId ?? root.id;
    cards = cards.map((member) => member.id === root.id || member.id === card.id
      ? { ...member, linkedGroupId: groupId } : member);
  }
  for (const id of new Set(cards.flatMap((card) => card.linkedGroupId ? [card.linkedGroupId] : []))) {
    compactLinkedGroup(id);
    pushOverlappingCards(new Set(cards.filter((card) => card.linkedGroupId === id).map((card) => card.id)));
  }
  focusedCardId = newCards.some((card) => card.id === restoredFocusedCardId)
    ? restoredFocusedCardId
    : null;
  selectedCardId = null;
  cachedBoardCamera = { ...newCamera };
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
  fitAllRan = true;
  notify();
}

export {
  subscribe,
  getMode,
  getCards,
  getMode as getCanvasMode,
  getCards as getCanvasCards,
};

export function useCanvasMode(): CanvasMode {
  return useSyncExternalStore(subscribe, getMode, getMode);
}

export function useCanvasPresentation(): CanvasPresentation {
  return useSyncExternalStore(subscribe, getPresentation, getPresentation);
}

export function useCanvasPresentationTransitioning(): boolean {
  return useSyncExternalStore(subscribe, getPresentationTransitioning, getPresentationTransitioning);
}

export function useCanvasCards(): CanvasCard[] {
  return useSyncExternalStore(subscribe, getCards, getCards);
}

export function useBoardCamera(): CanvasCamera {
  return useSyncExternalStore(subscribe, getBoardCamera, getBoardCamera);
}
