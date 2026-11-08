import type { FrameContent } from "./frameContent.ts";
import type { HtmlArtifactMetadata } from "../../transport/artifacts.ts";
import { iterationId, contentSourceUrl, flowRouteUrl, flowStateOf, type FlowStateBinding } from "./frameContent.ts";
import type { FlowDefinition, FlowState } from "../../transport/flows.ts";
import { FLOW_DEFAULT_VIEWPORT, FLOW_FRAME_GAP, FLOW_ROW_GAP, FLOW_TOP_GAP, flowGrid } from "../flows/flowLayout.ts";
import { frameLifecycle } from "./frameLifecycle.ts";
import { recordCanvasChange, discardCanvasHistory } from "../workspace/timeline.ts";
import { useSyncExternalStore } from "react";
import {
  DEFAULT_CAMERA,
  getBoardCamera,
  getCanvasPresentation,
  placeBoardCamera,
  restoreCanvasView,
  setCanvasMode,
  setCanvasPresentation,
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

/** Focus shows one frame across the board, so a frame created there opens snapped to the board's sides and follows it as panels open and close. */
function openingWidth(width: number): number {
  return getCanvasPresentation() === "focus" ? Math.max(200, visibleViewport().width) : width;
}

/** Adds one card to the end of the row. */
export function addCanvasCard(url: string, title?: string, { undoable = true }: { undoable?: boolean } = {}): CanvasCard {
  const before = cards;
  const lastSize = lastUsedCardSize ?? defaultViewportSize();
  const size = { width: openingWidth(lastSize.width), height: lastSize.height };
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
  if (undoable) recordCreation(before, [card]);
  notify();
  return card;
}

let activateHistoryCard: (cardId: string) => void = () => undefined;

/** Connects canvas replay to the draft controller without coupling the stores. */
export function setCanvasHistoryActivator(activate: (cardId: string) => void): void {
  activateHistoryCard = activate;
}

/** Selects a card and fits the camera to it, as choosing a page in the navigator does on the Canvas. */
export function revealCanvasCard(cardId: string): void {
  selectCard(cardId);
  const bounds = selectedBounds([cardId]);
  if (bounds) placeBoardCamera(fitCamera(bounds, visibleViewport(), FIT_ALL_PADDING) ?? getBoardCamera());
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
  options: { replaceActiveCard?: boolean; preserveIterationFocus?: boolean; undoable?: boolean; fillBoardWidth?: boolean } = {},
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
  if (options.replaceActiveCard && active?.content.kind === "route") {
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
    : cards.find((card) => card.content.kind === "route" && !card.content.flowState && card.content.url === targetHref) ?? findCardByNormalizedUrl(normalized);
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
    // Focus opens full width with no inset, so the frame counts as snapped to the board and follows it as panels open and close.
    const width = Math.max(200, options.fillBoardWidth ? viewport.width : viewport.width - PRIMARY_CARD_INSET * 2);
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

  const card = addCanvasCard(targetHref, undefined, { undoable: options.undoable });
  focusedCardId = card.id;
  selectedCardId = card.id;
  focusCanvasCards([card.id], viewport);
  return card;
}

export const COMPONENT_SHEET_SIZE = { width: 1100, height: 800 } as const;

let boardViewport: (() => { width: number; height: number } | null) | null = null;

/** The workspace reports its board size, which excludes the side panels, so camera fits use the visible area. */
export function setBoardViewportProvider(provider: (() => { width: number; height: number } | null) | null): void {
  boardViewport = provider;
}

function visibleViewport(): { width: number; height: number } {
  return boardViewport?.() ?? windowViewport();
}

/** Reveals the sheet frame for a component beside the application frame it was opened from, creating it on first use. Focus view shows the sheet in place; canvas view fits the camera to it. */
export function openComponentSheet(contract: { componentId: string; name: string }): CanvasCard {
  const previous = cards.find((card) => card.id === (selectedCardId ?? focusedCardId));
  const companion = previous?.content.kind === "route" ? previous : cards.find((card) => card.content.kind === "route");
  const existing = cards.find((card) => card.content.kind === "component" && card.content.componentId === contract.componentId);
  setCanvasMode("canvas");
  let card = existing;
  if (!card && getCanvasPresentation() === "focus") {
    // Focus view shows one frame, so browsing components routes a sheet already open to the next one instead of adding a frame per component.
    const sheet = previous?.content.kind === "component" ? previous : cards.find((candidate) => candidate.content.kind === "component");
    if (sheet) {
      card = { ...sheet, title: contract.name, content: { kind: "component", componentId: contract.componentId, name: contract.name } };
      const routed = card;
      cards = cards.map((candidate) => candidate.id === routed.id ? routed : candidate);
    }
  }
  if (card && card.height < COMPONENT_SHEET_SIZE.height) {
    // Sheets created beside a very short app frame would otherwise stay too short to show the grid.
    const grown = { ...card, height: COMPONENT_SHEET_SIZE.height };
    cards = cards.map((candidate) => candidate.id === grown.id ? grown : candidate);
    card = grown;
  }
  if (!card) {
    const before = cards;
    // Matches the app frame beside it, but never so short that the variant grid is cut off.
    const height = Math.max(companion?.height ?? 0, COMPONENT_SHEET_SIZE.height);
    const leftmost = cards.length ? Math.min(...cards.map((candidate) => candidate.x)) : 0;
    const width = openingWidth(COMPONENT_SHEET_SIZE.width);
    card = {
      id: `card-${++cardIdCounter}`,
      content: { kind: "component", componentId: contract.componentId, name: contract.name },
      title: contract.name,
      x: leftmost - CARD_GAP - width,
      y: companion?.y ?? (cards.length ? Math.min(...cards.map((candidate) => candidate.y)) : 0),
      width,
      height,
    };
    cards = [card, ...cards];
    recordCreation(before, [card]);
  }
  focusedCardId = card.id;
  selectedCardId = card.id;
  notify();
  if (getCanvasPresentation() === "focus") return card;
  const bounds = selectedBounds([card.id]);
  if (bounds) placeBoardCamera(fitCamera(bounds, visibleViewport(), FIT_ALL_PADDING) ?? getBoardCamera());
  return card;
}

/** Cards currently showing a component sheet. */
export function getComponentSheetCards(): readonly CanvasCard[] {
  return cards.filter((card) => card.content.kind === "component");
}

export function updateCardTitle(id: string, title: string): void {
  cards = cards.map((c) => (c.id === id ? { ...c, title } : c));
  notify();
}

export function updateCardUrl(id: string, url: string): void {
  // The frame now reports where it is, so the URL it was last sent to is spent: navigating there again reloads it.
  // A flow frame keeps its route, so a reload starts the recipe over instead of opening where its steps ended.
  cards = cards.map((c) => c.id === id && c.content.kind === "route"
    ? { ...c, content: c.content.flowState ? { kind: "route", url: flowRouteUrl(c.content.flowState), flowState: c.content.flowState } : { kind: "route", url } }
    : c);
  notify();
}

/** Navigates a live card to a new same-origin route. */
export function navigateCard(id: string, url: string): void {
  cards = cards.map((c) => c.id === id && c.content.kind === "route"
    ? { ...c, title: null, content: { kind: "route", url, navigationUrl: url, ...(c.content.flowState ? { flowState: c.content.flowState } : {}) } }
    : c);
  notify();
}

export function duplicateCard(sourceId: string): CanvasCard | null {
  const before = cards;
  const source = cards.find((c) => c.id === sourceId);
  if (!source || source.content.kind !== "route") return null;
  const lastSize = lastUsedCardSize ?? { width: source.width, height: source.height };
  const size = { width: openingWidth(lastSize.width), height: lastSize.height };
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
    width: openingWidth(Math.max(320, Math.round(artifact.viewport.width))),
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
  if (!source || source.content.kind === "component") return null;
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
    if (c.content.kind !== "route" || c.content.flowState) return false;
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

/** Subscribers re-render when the frame count changes, not when any frame moves. */
export function useCanvasCardCount(): number {
  return useSyncExternalStore(subscribe, () => cards.length, () => cards.length);
}

/** Subscribers re-render when this frame's label changes, not when any frame moves. */
export function useCanvasCardLabel(card: CanvasCard): string {
  const label = (): string => getCanvasCardLabel(card);
  return useSyncExternalStore(subscribe, label, label);
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

  if (card.content.kind === "component") return card.content.name;
  const flowState = flowStateOf(card.content);
  if (flowState) return flowState.tag ? `${flowState.label} · ${flowState.tag}` : flowState.label;
  if (card.content.kind === "iteration") return `${route.label} · Unlinked frame ${number}`;
  return number === 1 ? route.label : `${route.label} · Copy ${number}`;
}

export function flowStateBinding(flow: FlowDefinition, state: FlowState): FlowStateBinding {
  return {
    flowId: flow.id,
    stateId: state.id,
    flowTitle: flow.title,
    label: state.label,
    ...(state.tag ? { tag: state.tag } : {}),
    route: state.route,
    ...(state.expectRoute ? { expectRoute: state.expectRoute } : {}),
    scenario: {
      ...(state.seed ? { seed: state.seed } : {}),
      ...(state.network ? { network: state.network } : {}),
      ...(state.allowMutations ? { allowMutations: true } : {}),
      ...(state.hideStorage ? { hideStorage: state.hideStorage } : {}),
      ...(state.allowRealtime ? { allowRealtime: true } : {}),
    },
    steps: state.steps ?? [],
  };
}

export function getFlowCards(flowId: string): readonly CanvasCard[] {
  return cards.filter((card) => flowStateOf(card.content)?.flowId === flowId);
}

function flowStateCard(flow: FlowDefinition, state: FlowState, x: number, y: number, size: { width: number; height: number }): CanvasCard {
  return {
    id: `card-${++cardIdCounter}`,
    content: { kind: "route", url: flowRouteUrl(flowStateBinding(flow, state)), flowState: flowStateBinding(flow, state) },
    title: state.label,
    x,
    y,
    width: size.width,
    height: size.height,
  };
}

/** How long a newly opened flow's frames count as entering: long enough for the last column's staggered slide to finish. */
const FLOW_ENTRANCE_MS = 1600;
const enteringCards = new Map<string, { column: number; until: number }>();

/** The column a frame slides in with while its flow is just opening, so frames enter left to right; undefined once it has settled. */
export function getCardEntrance(cardId: string): number | undefined {
  const entrance = enteringCards.get(cardId);
  if (!entrance) return undefined;
  if (Date.now() < entrance.until) return entrance.column;
  enteringCards.delete(cardId);
  return undefined;
}

/** Lays a flow out below everything on the board as one undo step, or reveals it if it is already open. */
export function openFlowCards(flow: FlowDefinition, focusStateId?: string): void {
  setCanvasMode("canvas");
  setCanvasPresentation("canvas");
  let opened = getFlowCards(flow.id);
  if (opened.length === 0) {
    const before = cards;
    const size = flow.viewport ?? FLOW_DEFAULT_VIEWPORT;
    const left = cards.length ? Math.min(...cards.map((card) => card.x)) : 0;
    const top = cards.length ? Math.max(...cards.map((card) => card.y + card.height)) + FLOW_TOP_GAP : 0;
    const grid = flowGrid(flow);
    const until = Date.now() + FLOW_ENTRANCE_MS;
    const created = flow.states.map((state) => {
      const place = grid.get(state.id) ?? { column: 0, row: 0 };
      const card = flowStateCard(
        flow,
        state,
        left + place.column * (size.width + FLOW_FRAME_GAP),
        top + place.row * (size.height + FLOW_ROW_GAP),
        size,
      );
      enteringCards.set(card.id, { column: place.column, until });
      return card;
    });
    cards = [...cards, ...created];
    recordCreation(before, created);
    opened = created;
  }
  // Opening the flow itself shows all of it with its first screen selected; a state chosen from the list lands on that state.
  const stateCard = (stateId: string | undefined) => opened.find((card) => flowStateOf(card.content)?.stateId === stateId);
  const focus = stateCard(focusStateId);
  const target = focus ?? stateCard(flow.states[0]?.id) ?? opened[0];
  if (!target) return notify();
  focusedCardId = target.id;
  selectedCardId = target.id;
  notify();
  if (focus) {
    const bounds = selectedBounds([focus.id]);
    if (bounds) placeBoardCamera(fitCamera(bounds, visibleViewport(), FIT_ALL_PADDING) ?? getBoardCamera());
    return;
  }
  const bounds = selectedBounds(opened.map((card) => card.id));
  if (bounds) placeBoardCamera(fitFlowCamera(bounds, visibleViewport()) ?? getBoardCamera());
}

/** Screen room the flow title takes above its frames (see `.flow-board__title`); the title keeps its size at any zoom. */
const FLOW_TITLE_ROOM = 104;

/** Fits a whole flow below its title. A flow too big to fit at the furthest zoom keeps its first screen's corner in view rather than its middle. */
function fitFlowCamera(bounds: Bounds, viewport: { width: number; height: number }): CanvasCamera | null {
  const fit = fitCamera(bounds, { width: viewport.width, height: viewport.height - FLOW_TITLE_ROOM }, FIT_ALL_PADDING);
  if (!fit) return null;
  const { zoom } = fit;
  const tooWide = (bounds.maxX - bounds.minX) * zoom > viewport.width - FIT_ALL_PADDING * 2;
  const tooTall = (bounds.maxY - bounds.minY) * zoom > viewport.height - FLOW_TITLE_ROOM - FIT_ALL_PADDING * 2;
  return {
    x: tooWide ? FIT_ALL_PADDING - bounds.minX * zoom : fit.x,
    y: tooTall ? FIT_ALL_PADDING + FLOW_TITLE_ROOM - bounds.minY * zoom : fit.y + FLOW_TITLE_ROOM,
    zoom,
  };
}

/** Takes a flow's frames off the board. Undo brings each one back. */
export function closeFlowCards(flowId: string): void {
  batchCanvasChanges(() => {
    for (const card of getFlowCards(flowId)) {
      if (cards.length > 1) removeCanvasCard(card.id, { undoable: true });
    }
  });
}

/** Applies an edited flow file to its open frames, keeping where the user put them. */
export function syncFlowCards(flows: readonly FlowDefinition[]): void {
  batchCanvasChanges(() => {
    for (const flow of flows) {
      const opened = getFlowCards(flow.id);
      if (opened.length === 0) continue;
      const seen = new Set<string>();
      for (const card of opened) {
        const current = flowStateOf(card.content);
        if (!current || card.content.kind !== "route") continue;
        const state = flow.states.find((candidate) => candidate.id === current.stateId);
        if (!state) {
          if (cards.length > 1) removeCanvasCard(card.id);
          continue;
        }
        seen.add(state.id);
        const next = flowStateBinding(flow, state);
        if (JSON.stringify(next) === JSON.stringify(current)) continue;
        const content: FrameContent = {
          kind: "route",
          url: flowRouteUrl(next),
          flowState: next,
        };
        cards = cards.map((candidate) => candidate.id === card.id ? { ...candidate, content, title: state.label } : candidate);
        notify();
      }
      const added = flow.states.filter((state) => !seen.has(state.id));
      if (added.length === 0) continue;
      const remaining = getFlowCards(flow.id);
      const anchor = remaining[0];
      const size = anchor ?? flow.viewport ?? FLOW_DEFAULT_VIEWPORT;
      let x = remaining.length ? Math.max(...remaining.map((card) => card.x + card.width)) + FLOW_FRAME_GAP : 0;
      const y = anchor?.y ?? 0;
      for (const state of added) {
        cards = [...cards, flowStateCard(flow, state, x, y, size)];
        x += size.width + FLOW_FRAME_GAP;
      }
      notify();
    }
  });
}
