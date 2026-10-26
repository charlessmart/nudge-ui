import { useSyncExternalStore } from "react";

/**
 * Which cards have a subtree pulled apart. Explode view runs inside each renderer and reports its own phase, so this
 * is per card: one frame putting its subtree back must not show the controller's flat element chrome over another
 * frame that is still apart.
 */
let explodedCards: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setFrameExploded(cardId: string, exploded: boolean): void {
  if (explodedCards.has(cardId) === exploded) return;
  const next = new Set(explodedCards);
  if (exploded) next.add(cardId);
  else next.delete(cardId);
  explodedCards = next;
  notify();
}

/** Clears every card, for when the view itself is put away or the renderer reports a whole new document. */
export function clearFramesExploded(): void {
  if (explodedCards.size === 0) return;
  explodedCards = new Set();
  notify();
}

export function isFrameExploded(cardId: string | null): boolean {
  return cardId !== null && explodedCards.has(cardId);
}

/** True while the card owning the current selection is holding a subtree apart. */
export function useFrameExploded(cardId: string | null): boolean {
  return useSyncExternalStore(subscribe, () => isFrameExploded(cardId), () => isFrameExploded(cardId));
}
