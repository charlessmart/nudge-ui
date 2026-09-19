import { useSyncExternalStore } from "react";
import type { AgentSketchAttachment, AgentSketchMetadata } from "../agent/protocol.ts";
import { blobToBase64 } from "./raster.ts";
import { toAgentSketchMetadata, type SketchQueueItem } from "./model.ts";

export interface SketchHandoffEntry {
  readonly id: string;
  readonly revision: number;
  readonly metadata: AgentSketchMetadata;
  readonly annotatedImage: Blob;
}

export interface SketchClipboardHandoffSnapshot {
  readonly localBatchId: string;
  readonly entries: readonly SketchHandoffEntry[];
}

const EMPTY_HANDOFF: SketchClipboardHandoffSnapshot | null = null;
let handoffSnapshot: SketchClipboardHandoffSnapshot | null = EMPTY_HANDOFF;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A handoff view must not prevent other subscribers from updating.
    }
  }
}

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // Use the fallback below.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createSketchHandoffSnapshot(items: readonly SketchQueueItem[]): SketchClipboardHandoffSnapshot | null {
  if (items.length === 0) return null;
  return {
    localBatchId: randomId(),
    entries: items.map((item) => ({
      id: item.document.id,
      revision: item.document.revision,
      metadata: toAgentSketchMetadata(item.document),
      annotatedImage: item.document.annotatedImage,
    })),
  };
}

export function createSketchAttachments(
  handoff: SketchClipboardHandoffSnapshot,
): Promise<AgentSketchAttachment[]> {
  return Promise.all(handoff.entries.map(async (entry) => ({
    ...entry.metadata,
    data: await blobToBase64(entry.annotatedImage),
  })));
}

export function sketchMetadataForHandoff(
  handoff: SketchClipboardHandoffSnapshot | null,
): readonly AgentSketchMetadata[] {
  return handoff?.entries.map((entry) => entry.metadata) ?? [];
}

export function getSketchClipboardHandoffSnapshot(): SketchClipboardHandoffSnapshot | null {
  return handoffSnapshot;
}

export function subscribeSketchClipboardHandoff(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSketchClipboardHandoff(): SketchClipboardHandoffSnapshot | null {
  return useSyncExternalStore(
    subscribeSketchClipboardHandoff,
    getSketchClipboardHandoffSnapshot,
    getSketchClipboardHandoffSnapshot,
  );
}

export function recordSketchClipboardHandoff(snapshot: SketchClipboardHandoffSnapshot | null): void {
  handoffSnapshot = snapshot;
  notify();
}

export function clearSketchClipboardHandoff(): void {
  if (handoffSnapshot === null) return;
  handoffSnapshot = null;
  notify();
}

export function resetSketchClipboardHandoff(): void {
  handoffSnapshot = null;
  notify();
}
