import type { ChangeRecord } from "./types.ts";
import { getWorkspaceChanges } from "./workspaceChanges.ts";
import {
  applyHostWorkspaceProjection,
  compileWorkspaceProjection,
} from "../projection/workspaceProjection.ts";

export {
  buildManagedStyleRules,
  selectorForManagedChange,
  verifyManagedStyleProjection,
} from "./managedStyleProjection.ts";

/** Compatibility entry point while callers migrate to complete workspace plans. */
export function applyChangeProjections(changes: ChangeRecord[]): ChangeRecord[] {
  const workspace = getWorkspaceChanges();
  applyHostWorkspaceProjection(compileWorkspaceProjection({
    ...workspace,
    changes,
  }));
  return changes;
}
