import { useSyncExternalStore } from "react";

export type CanvasMode = "inspect" | "canvas";

export interface CanvasCard {
  id: string;
  url: string;
  title: string | null;
}

let mode: CanvasMode = "inspect";
let cards: CanvasCard[] = [];
let cardIdCounter = 0;
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

export function setCanvasMode(newMode: CanvasMode): void {
  if (mode === newMode) return;
  mode = newMode;
  notify();
}

export function enterCanvas(): void {
  if (mode === "canvas") return;
  mode = "canvas";
  if (cards.length === 0) {
    const card: CanvasCard = {
      id: `card-${++cardIdCounter}`,
      url: window.location.href,
      title: document.title,
    };
    cards = [card];
  }
  notify();
}

export function exitCanvas(): void {
  if (mode === "inspect") return;
  mode = "inspect";
  notify();
}

export function addCanvasCard(url: string, title?: string): CanvasCard {
  const card: CanvasCard = {
    id: `card-${++cardIdCounter}`,
    url,
    title: title ?? null,
  };
  cards = [...cards, card];
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

export { subscribe, getMode, getCards, getMode as getCanvasMode, getCards as getCanvasCards };

export function useCanvasMode(): CanvasMode {
  return useSyncExternalStore(subscribe, getMode, getMode);
}

export function useCanvasCards(): CanvasCard[] {
  return useSyncExternalStore(subscribe, getCards, getCards);
}
