import type { InvocationRef, RenderedInstanceRef } from "./editModel.ts";

export interface StructuralDelete {
  id: string;
  kind: "delete";
  target: RenderedInstanceRef;
  /** Hash-independent route where the target was captured. */
  route?: string;
  /** View identity where the target was captured. */
  state?: string;
}

export interface StructuralMove {
  id: string;
  kind: "move";
  target: RenderedInstanceRef;
  source: {
    parent: RenderedInstanceRef;
    /** Present when the parent renders this invocation's children, which are authored at its callsite. */
    childrenOf?: InvocationRef;
  };
  destination: {
    parent: RenderedInstanceRef;
    before: RenderedInstanceRef | null;
    childrenOf?: InvocationRef;
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
  /** Diagnostic only; never changes canonical structural intent. */
  reason?: StructuralProjectionReason;
}
