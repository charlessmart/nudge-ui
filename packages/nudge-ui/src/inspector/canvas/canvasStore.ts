import type { FrameContent } from "./frameContent.ts";
import { studyArtifactId, contentSourceUrl } from "./frameContent.ts";
import { recordCanvasCreation, discardCanvasHistory, isWorkspaceHistoryLocked } from "../changes/workspaceChanges.ts";
import { useSyncExternalStore } from "react";
import { normalizeUrl, normalizedUrlKey, type NormalizedUrl } from "./normalizeUrl.ts";
import { removeHtmlArtifact } from "../artifacts/client.ts";

export type CanvasMode = "inspect" | "canvas";
export type CanvasPresentation = "focus" | "canvas";

export interface FrameGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasCard extends FrameGeometry {
  id: string;
  content: FrameContent;
  entrance?: "linked" | "variation";
  /** Directly placed variations skip entrance animation, including on redo. */
  animateEntrance?: boolean;
  groupId?: string;
  title: string | null;
}

export type FrameGroup =
  | { readonly id: string; readonly kind: "linked" }
  | { readonly id: string; readonly kind: "agent"; readonly label: string; readonly agentId: string; readonly routes: readonly { url: string; title?: string; label?: string }[] };

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
  if (group.kind === "linked") return true;
  return group.kind === "agent" && typeof group.label === "string" && typeof group.agentId === "string"
    && Array.isArray(group.routes) && group.routes.every((route: { url?: unknown }) => {
      try { return typeof route.url === "string" && new URL(route.url).origin === window.location.origin; } catch { return false; }
    });
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

export function getCanvasPresentation(): CanvasPresentation {
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

export function setCanvasPresentation(
  next: CanvasPresentation,
): void {
  if (presentation === next) return;
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

/** Adds one card while retaining the existing placement policy. */
export function addCanvasCard(url: string, title?: string): CanvasCard {
  const before = cards;
  const size = lastUsedCardSize ?? defaultViewportSize();
  const pos = computeNewCardPosition(cards, CARD_GAP);
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
  // Creation can compact a group and push neighbors. Record only those layout
  // fields, so later title and navigation metadata survive replay.
  const layout = ["x", "y", "groupId"] as const;
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
      const from = redo ? old : next;
      const target = redo ? next : old;
      return { ...card, x: card.x + target.x - from.x, y: card.y + target.y - from.y,
        groupId: card.groupId === from.groupId ? target.groupId : card.groupId };
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
      for (const artifactId of new Set(created.flatMap((card) => card.content.kind === "study" ? [card.content.artifactId] : []))) {
        if (!cards.some((card) => studyArtifactId(card.content) === artifactId)) {
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
  if (isWorkspaceHistoryLocked()) return;
  const removedArtifactId = studyArtifactId(cards.find((card) => card.id === id)?.content);
  const removed = cards.find((card) => card.id === id);
  if (!removed) return;
  discardCanvasHistory(id);
  cards = cards.filter((c) => c.id !== id);
  selectFallbackAfterRemoval(new Set([id]));
  if (removed.groupId) compactLinkedGroup(removed.groupId);
  notify();
  if (removedArtifactId && !cards.some((card) => studyArtifactId(card.content) === removedArtifactId)) {
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
  options: { replaceActiveCard?: boolean; preserveStudyFocus?: boolean } = {},
): CanvasCard | null {
  const normalized = normalizeUrl(url);
  if (!normalized || normalized.origin !== window.location.origin) return null;
  const targetHref = new URL(url).href;

  mode = "canvas";
  const active = cards.find((card) => card.id === (selectedCardId ?? focusedCardId));
  if (options.preserveStudyFocus && active?.content.kind === "study") {
    const sourceRoute = normalizeUrl(active.content.sourceUrl);
    if (sourceRoute && normalizedUrlKey(sourceRoute) === normalizedUrlKey(normalized)) {
      focusedCardId = active.id;
      selectedCardId = active.id;
      notify();
      return active;
    }
  }
  if (options.replaceActiveCard && active && !studyArtifactId(active.content)) {
    const oldRoute = normalizeUrl(contentSourceUrl(active.content));
    const changedRoute = !oldRoute || normalizedUrlKey(oldRoute) !== normalizedUrlKey(normalized);
    const next = {
      ...active,
      content: { kind: "route" as const, url: targetHref, ...(contentSourceUrl(active.content) !== targetHref ? { navigationUrl: targetHref } : {}) },
      ...(changedRoute ? { title: null, groupId: undefined, entrance: undefined } : {}),
    };
    cards = cards.map((card) => card.id === active.id ? next : card);
    if (changedRoute && active.groupId) compactLinkedGroup(active.groupId);
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
  cards = cards.map((c) => (c.id === id && c.content.kind === "route" ? { ...c, content: { ...c.content, url } } : c));
  notify();
}

export function duplicateCard(sourceId: string): CanvasCard | null {
  const before = cards;
  const source = cards.find((c) => c.id === sourceId);
  if (!source || source.content.kind !== "route") return null;
  const size = lastUsedCardSize ?? { width: source.width, height: source.height };
  const groupId = source.groupId ?? source.id;
  if (!frameGroups.has(groupId)) setFrameGroup({ id: groupId, kind: "linked" });
  const card: CanvasCard = {
    id: `card-${++cardIdCounter}`,
    content: { kind: "route", url: source.content.url },
    entrance: "linked",
    groupId,
    title: source.title,
    x: source.x + source.width + CARD_GAP,
    y: source.y,
    width: size.width,
    height: size.height,
  };
  const index = cards.indexOf(source);
  cards = cards.map((c) => c.id === sourceId ? { ...c, groupId } : c);
  cards = [...cards.slice(0, index + 1), card, ...cards.slice(index + 1)];
  if (groupId) compactLinkedGroup(groupId);
  pushOverlappingCards(new Set(groupId
    ? cards.filter((c) => c.groupId === groupId).map((c) => c.id)
    : [card.id]));
  lastUsedCardSize = { width: size.width, height: size.height };
  recordCreation(before, [card]);
  notify();
  return cards.find((c) => c.id === card.id)!;
}

/** Compacts linked views in their durable order, retaining the group's anchor. */
function compactLinkedGroup(id: string): void {
  const members = cards.filter((c) => c.groupId === id);
  if (members.length === 0) return;
  let x = Math.min(...members.map((c) => c.x));
  const y = members[0]!.y;
  const positions = new Map<string, number>();
  for (const member of members) {
    positions.set(member.id, x);
    x += member.width + CARD_GAP;
  }
  cards = cards.map((c) => positions.has(c.id)
    ? { ...c, x: positions.get(c.id)!, y, groupId: members.length > 1 || frameGroups.get(id)?.kind === "agent" ? id : undefined }
    : c);
}

/** Moves overlapping neighbors right, keeping each linked group intact. */
function pushOverlappingCards(protectedIds: ReadonlySet<string>): void {
  const units: CanvasCard[][] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    const key = card.groupId ?? card.id;
    if (seen.has(key)) continue;
    seen.add(key);
    units.push(card.groupId ? cards.filter((c) => c.groupId === key) : [card]);
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

export function moveFrameGroup(id: string, dx: number, dy: number): void {
  cards = cards.map((card) => card.groupId === id
    ? { ...card, x: card.x + dx, y: card.y + dy } : card);
  notify();
}

/** Adds an independent HTML variation while retaining its source and linked group. */
export function addCanvasVariation(sourceId: string, artifactId: string, position?: { x: number; y: number }, animateEntrance = true): CanvasCard | null {
  const before = cards;
  const source = cards.find((card) => card.id === sourceId);
  if (!source) return null;
  const group = cards.filter((card) => card.id === sourceId || (source.groupId && card.groupId === source.groupId));
  const x = position?.x ?? source.x;
  let y = position?.y ?? boundsOf(group).maxY + CARD_GAP * 2;
  if (!position) {
    for (const neighbor of [...cards].sort((a, b) => a.y - b.y)) {
      if (x >= neighbor.x + neighbor.width + CARD_GAP || x + source.width + CARD_GAP <= neighbor.x) continue;
      if (y < neighbor.y + neighbor.height + CARD_GAP * 2 && y + source.height + CARD_GAP * 2 > neighbor.y) y = neighbor.y + neighbor.height + CARD_GAP * 2;
    }
  }
  const variation: CanvasCard = {
    id: `card-${++cardIdCounter}`, content: { kind: "study", sourceUrl: contentSourceUrl(source.content), artifactId }, title: source.title,
    width: source.width, height: source.height, x, y, entrance: "variation", animateEntrance,
  };
  cards = [...cards, variation];
  recordCreation(before, [variation]);
  notify();
  return variation;
}

export function resizeCard(
  id: string,
  width: number,
  height: number,
  position?: { readonly x: number; readonly y: number },
): void {
  cards = cards.map((c) => (c.id === id
    ? { ...c, width, height, ...(position && !c.groupId ? { x: position.x, y: position.y } : {}) }
    : c));
  const resized = cards.find((card) => card.id === id);
  if (resized?.groupId) {
    compactLinkedGroup(resized.groupId);
    pushOverlappingCards(new Set(cards.filter((c) => c.groupId === resized.groupId).map((c) => c.id)));
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
  if (cards.some((card) => card.id === id && card.groupId)) return;
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
  mode = newMode;
  presentation = restoredPresentation;
  frameGroups.clear();
  for (const group of restoredGroups) frameGroups.set(group.id, group);
  cards = newCards.map((card) => ({ ...card, groupId: studyArtifactId(card.content) ? undefined : card.groupId }));
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
  return useSyncExternalStore(subscribe, getCanvasPresentation, getCanvasPresentation);
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

/** Adds independent routes as one undoable grid without moving existing frames. */
export function addCanvasRouteGrid(routes: readonly { url: string; title?: string }[]): CanvasCard[] {
  if (!routes.length || routes.length > 64 || isWorkspaceHistoryLocked()) return [];
  const unique = new Set<string>();
  for (const route of routes) {
    const normalized = normalizeUrl(route.url);
    if (!normalized || normalized.origin !== window.location.origin || unique.has(route.url)) return [];
    unique.add(route.url);
  }
  const before = cards;
  const size = lastUsedCardSize ?? defaultViewportSize();
  const columns = Math.ceil(Math.sqrt(routes.length));
  const top = cards.length ? Math.max(...cards.map((card) => card.y + card.height)) + CARD_GAP : 0;
  const created = routes.map((route, index): CanvasCard => ({
    id: `card-${++cardIdCounter}`, content: { kind: "route", url: route.url }, title: route.title ?? null,
    x: (index % columns) * (size.width + CARD_GAP), y: top + Math.floor(index / columns) * (size.height + CARD_GAP),
    width: size.width, height: size.height,
  }));
  cards = [...cards, ...created];
  recordCreation(before, created);
  selectCard(created[0]!.id);
  notify();
  return created;
}
