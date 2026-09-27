import type { SerializableChange } from "../changes/codecs.ts";
import type { StructuralChange } from "../changes/structuralTypes.ts";
import type { SketchDocument } from "../sketch/model.ts";

/** Read-only JSON metadata. Implementations must also copy inputs at runtime. */
type HistoryValue<T> = T extends object
  ? { readonly [Key in keyof T]: HistoryValue<T[Key]> }
  : T;

/** An immutable image stored separately from history metadata. IDs are project-local. */
export interface HistoryImage {
  readonly id: string;
  readonly mimeType: "image/png";
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
}

/** Retains editable sketch layers and exact image revisions after queue cleanup. */
export type HistorySketch = HistoryValue<Omit<SketchDocument,
  "originalImage" | "annotatedImage" | "originalByteSize" | "annotatedByteSize"
>> & {
  readonly originalImage: HistoryImage;
  readonly annotatedImage: HistoryImage;
};

/** Complete pending intent, including inherited edits, rather than a delta. */
export interface DraftContents {
  readonly changes: readonly HistoryValue<SerializableChange>[];
  readonly structuralChanges: readonly HistoryValue<StructuralChange>[];
  readonly sketches: readonly HistorySketch[];
  readonly notes: string;
}

export interface HistoryDraft {
  readonly id: string;
  readonly projectId: string;
  readonly label: string;
  readonly revision: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  /** Historical ancestry, not a promise that the current source matches it. */
  readonly baseCheckpointId: string | null;
  readonly contents: DraftContents;
}

/** One captured viewport. This does not claim to preserve the entire page. */
export interface CheckpointView {
  readonly id: string;
  readonly sourceFrameId: string;
  readonly url: string;
  readonly title: string;
  readonly capturedAt: number;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly scroll: { readonly x: number; readonly y: number };
  readonly devicePixelRatio: number;
  readonly image: HistoryImage;
}

export type CheckpointOrigin =
  | { readonly kind: "manual" | "comparison" | "proposal" }
  | { readonly kind: "implementation"; readonly handoffId: string };

/** Append-only history; reconciliation must never remove or rewrite its intent. */
export interface HistoryCheckpoint {
  readonly id: string;
  readonly projectId: string;
  readonly label: string;
  readonly createdAt: number;
  readonly parentCheckpointId: string | null;
  readonly draftId: string;
  readonly draftRevision: number;
  readonly origin: CheckpointOrigin;
  readonly contents: DraftContents;
  /** At least one successfully persisted capture is required. */
  readonly views: readonly [CheckpointView, ...CheckpointView[]];
}

/** Canvas geometry stays in CanvasCard; this association selects its content. */
export type HistoryFrameContent =
  | { readonly kind: "live"; readonly draftId: string }
  | { readonly kind: "snapshot"; readonly checkpointId: string; readonly viewId: string };

export type HistoryHandoffOutcome =
  | { readonly kind: "prepared" }
  | { readonly kind: "copied"; readonly at: number }
  | { readonly kind: "sent"; readonly at: number; readonly agentRequestId: string }
  | { readonly kind: "failed"; readonly at: number; readonly message: string }
  | { readonly kind: "review-needed"; readonly at: number; readonly resultCheckpointId: string }
  | {
    readonly kind: "accepted";
    readonly at: number;
    readonly resultCheckpointId: string;
    readonly confirmation: "user" | "verified";
  };

export interface HistoryHandoff {
  readonly id: string;
  readonly projectId: string;
  readonly createdAt: number;
  readonly proposalCheckpointId: string;
  /** Preserved alternatives; empty when there is no comparison frame. */
  readonly comparisonCheckpointIds: readonly string[];
  /** Exact exported text, retained independently of later prompt generation. */
  readonly prompt: string;
  readonly transport: "clipboard" | "agent";
  /** Version one applies to shared source, not an isolated implementation. */
  readonly target: "shared-source";
  readonly outcome: HistoryHandoffOutcome;
}

/** Project-scoped metadata; image bytes are never embedded in this record. */
export interface HistorySnapshot {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly drafts: readonly HistoryDraft[];
  readonly checkpoints: readonly HistoryCheckpoint[];
  readonly handoffs: readonly HistoryHandoff[];
}
