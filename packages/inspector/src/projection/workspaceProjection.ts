import { applyRules, rulesToCssText, type StyleRule } from "./managedStylesheet.ts";
import {
  applyRenderedInstanceProjection,
  collectRenderedInstanceOverrides,
  type RenderedInstanceOverride,
} from "./renderedInstance.ts";
import {
  applyStructuralProjection,
  type StructuralChange,
} from "./structuralProjection.ts";
import {
  applyTextContentProjection,
  collectTextContentChanges,
} from "./textProjection.ts";
import { replaceComponentOverrideProjection } from "../componentSemantics/index.ts";
import { componentChangeToOverride } from "../componentSemantics/changeModel.ts";
import type { ComponentOverride } from "../componentSemantics/types.ts";
import { isComponentChange, type TextContentChangeRecord } from "../changes/types.ts";
import { buildManagedStyleRules } from "../changes/managedStyleProjection.ts";
import type { WorkspaceChangesSnapshot } from "../changes/workspaceChanges.ts";

/** A complete, immutable projection compiled from one canonical workspace snapshot. */
export interface WorkspaceProjectionPlan {
  readonly sourceRevision: number;
  readonly managedRules: readonly StyleRule[];
  readonly css: string;
  readonly instanceOverrides: readonly RenderedInstanceOverride[];
  readonly structuralChanges: readonly StructuralChange[];
  readonly textContentChanges: readonly TextContentChangeRecord[];
  readonly componentOverrides: readonly ComponentOverride[];
}

/** Applies every projection dimension to one document-local runtime. */
export interface DocumentProjectionAdapter {
  applyStructural(changes: readonly StructuralChange[]): void;
  applyRenderedInstances(overrides: readonly RenderedInstanceOverride[]): void;
  applyText(changes: readonly TextContentChangeRecord[]): void;
  applyComponents(overrides: readonly ComponentOverride[]): void;
  applyManagedStyles(rules: readonly StyleRule[], css: string): void;
}

export function compileWorkspaceProjection(
  snapshot: WorkspaceChangesSnapshot,
): WorkspaceProjectionPlan {
  const changes = [...snapshot.changes];
  const managedRules = buildManagedStyleRules(changes);
  return {
    sourceRevision: snapshot.revision,
    managedRules,
    css: rulesToCssText(managedRules),
    instanceOverrides: collectRenderedInstanceOverrides(changes),
    structuralChanges: [...snapshot.structuralChanges],
    textContentChanges: collectTextContentChanges(changes),
    componentOverrides: changes
      .filter(isComponentChange)
      .map(componentChangeToOverride)
      .filter((override): override is ComponentOverride => override !== null),
  };
}

/**
 * Replaces one document projection in the required order.
 *
 * Structural intent is applied first because later rendered-instance evidence
 * can depend on the restored element order. Managed CSS is applied last so
 * selectors can use the document-local instance markers installed above.
 */
export function applyWorkspaceProjection(
  adapter: DocumentProjectionAdapter,
  plan: WorkspaceProjectionPlan,
): void {
  adapter.applyStructural(plan.structuralChanges);
  adapter.applyRenderedInstances(plan.instanceOverrides);
  adapter.applyText(plan.textContentChanges);
  adapter.applyComponents(plan.componentOverrides);
  adapter.applyManagedStyles(plan.managedRules, plan.css);
}

const hostDocumentProjectionAdapter: DocumentProjectionAdapter = {
  applyStructural: (changes) => {
    applyStructuralProjection(document, changes);
  },
  applyRenderedInstances: (overrides) => {
    applyRenderedInstanceProjection(document, overrides);
  },
  applyText: (changes) => {
    applyTextContentProjection(document, changes);
  },
  applyComponents: replaceComponentOverrideProjection,
  applyManagedStyles: (rules) => {
    applyRules([...rules]);
  },
};

export function applyHostWorkspaceProjection(plan: WorkspaceProjectionPlan): void {
  applyWorkspaceProjection(hostDocumentProjectionAdapter, plan);
}
