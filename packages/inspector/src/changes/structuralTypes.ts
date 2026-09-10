import type { RenderedInstanceRef } from "../projection/renderedInstance.ts";

/** Controller-owned intent to remove one rendered instance. */
export interface StructuralDelete {
  id: string;
  kind: "delete";
  target: RenderedInstanceRef;
}

/** Controller-owned intent to move one rendered instance. */
export interface StructuralMove {
  id: string;
  kind: "move";
  target: RenderedInstanceRef;
  source: {
    parent: RenderedInstanceRef;
  };
  destination: {
    parent: RenderedInstanceRef;
    before: RenderedInstanceRef | null;
  };
  presentation: {
    sourceParentTag: string;
    destinationParentTag: string;
    fromIndex: number;
    toIndex: number;
  };
}

export type StructuralChange = StructuralDelete | StructuralMove;
export type StructuralProjectionStatus = "applied" | "missing" | "ambiguous" | "overridden";
export type StructuralProjectionReason =
  | "target"
  | "source-parent"
  | "destination-parent"
  | "anchor"
  | "illegal-destination"
  | "react-override";

export interface StructuralProjectionReport {
  changeId: string;
  status: StructuralProjectionStatus;
  /** Bounded diagnostic data; it never changes canonical structural intent. */
  reason?: StructuralProjectionReason;
}
