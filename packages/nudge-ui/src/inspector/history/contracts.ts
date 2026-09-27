import type {
  CheckpointOrigin,
  DraftContents,
  HistoryCheckpoint,
  HistoryDraft,
  HistoryHandoff,
  HistoryHandoffOutcome,
  HistorySnapshot,
} from "./model.ts";

/** Pins an operation to the draft revision the user actually reviewed. */
export interface DraftRevision {
  readonly draftId: string;
  readonly revision: number;
}

export interface CheckpointRequest {
  readonly draft: DraftRevision;
  readonly label: string;
  readonly origin: CheckpointOrigin;
  /** All frames must display this draft. Captures must match its revision. */
  readonly frameIds: readonly [string, ...string[]];
}

export type HistoryFailureCode =
  | "not-found"
  | "revision-conflict"
  | "invalid-reference"
  | "invalid-transition"
  | "capture-failed"
  | "storage-failed"
  | "read-only";

export type HistoryResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: HistoryFailureCode; readonly message: string };

/**
 * Controller-owned history module. One instance owns one project. Mutations
 * require the workspace write lease. Successful mutations return durable,
 * detached values and notify subscribers once. Failures leave published state
 * unchanged. Reads expose a stable snapshot until the next successful
 * mutation. Image bytes live outside the metadata.
 *
 * The current browser implementation lives in `store.ts` and exposes workflow
 * functions for canvas and prompt adapters. This interface documents the
 * target contract for project-scoped storage, atomic publication, and handoff
 * tracking; not every method has a one-to-one runtime export yet.
 */
export interface VersionHistory {
  getSnapshot(): HistorySnapshot;
  subscribe(listener: () => void): () => void;

  /** Saves complete intent; a null target creates the initial draft. */
  saveDraft(input: {
    readonly target: DraftRevision | null;
    readonly label: string;
    readonly contents: DraftContents;
  }): Promise<HistoryResult<HistoryDraft>>;

  /** Copies current intent and ancestry into a draft with independent identity. */
  forkDraft(input: {
    readonly source: DraftRevision;
    readonly label: string;
  }): Promise<HistoryResult<HistoryDraft>>;

  /** Captures and persists images before publishing an immutable checkpoint. */
  saveCheckpoint(input: CheckpointRequest): Promise<HistoryResult<HistoryCheckpoint>>;

  /**
   * Atomically saves the proposal, comparisons, and exact prompt before export.
   * Does not write the clipboard, send to an agent, or replace canvas frames.
   * A failed export can retry with the returned handoff instead of recapturing.
   */
  prepareHandoff(input: {
    readonly proposal: Omit<CheckpointRequest, "origin">;
    readonly comparisons: readonly Omit<CheckpointRequest, "origin">[];
    readonly prompt: string;
    readonly transport: "clipboard" | "agent";
  }): Promise<HistoryResult<HistoryHandoff>>;

  /**
   * Updates delivery/review state without mutating the proposal. Result references
   * must identify implementation checkpoints belonging to this handoff. Delivery
   * alone never proves acceptance; invalid state transitions must be rejected.
   */
  recordHandoffOutcome(input: {
    readonly handoffId: string;
    readonly outcome: Exclude<HistoryHandoffOutcome, { readonly kind: "prepared" }>;
  }): Promise<HistoryResult<HistoryHandoff>>;

  /** Reads an immutable image in this project; callers own object URL cleanup. */
  readImage(imageId: string): Promise<HistoryResult<Blob>>;
}
