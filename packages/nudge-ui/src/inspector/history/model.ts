import type { SerializableChange } from "../changes/codecs.ts";
import type { StructuralChange } from "../changes/structuralTypes.ts";

/** Read-only JSON metadata. Implementations must also copy inputs at runtime. */
type HistoryValue<T> = T extends object
  ? { readonly [Key in keyof T]: HistoryValue<T[Key]> }
  : T;

/** Complete pending intent, including inherited edits, rather than a delta. */
export interface DraftContents {
  readonly changes: readonly HistoryValue<SerializableChange>[];
  readonly structuralChanges: readonly HistoryValue<StructuralChange>[];
  readonly sketches: readonly unknown[];
  readonly notes: string;
}

export interface HistoryDraft {
  readonly id: string;
  readonly projectId: string;
  readonly label: string;
  readonly revision: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly contents: DraftContents;
}

/** Canvas geometry stays in CanvasCard; this association selects its content. */
export type HistoryFrameContent = {
  readonly kind: "live";
  readonly draftId: string;
};

/** Project-scoped metadata for per-card design drafts. */
export interface HistorySnapshot {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly drafts: readonly HistoryDraft[];
}