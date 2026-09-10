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
import type { WorkspaceContents } from "../changes/workspaceChanges.ts";

export interface WorkspaceProjectionSource extends WorkspaceContents {
  readonly revision: number;
}

export interface CompiledManagedStyles {
  readonly rules: readonly StyleRule[];
  readonly css: string;
}

export interface SerializedManagedStyles {
  readonly css: string;
}

/** A complete, read-only projection for one document-local runtime. */
export interface WorkspaceProjectionPlan<ManagedStyles> {
  readonly sourceRevision: number;
  readonly managedStyles: ManagedStyles;
  readonly instanceOverrides: readonly RenderedInstanceOverride[];
  readonly structuralChanges: readonly StructuralChange[];
  readonly textContentChanges: readonly TextContentChangeRecord[];
  readonly componentOverrides: readonly ComponentOverride[];
}

/** Applies every projection dimension to one document-local runtime. */
export interface DocumentProjectionAdapter<ManagedStyles> {
  applyStructural(changes: readonly StructuralChange[]): void;
  applyRenderedInstances(overrides: readonly RenderedInstanceOverride[]): void;
  applyText(changes: readonly TextContentChangeRecord[]): void;
  applyComponents(overrides: readonly ComponentOverride[]): void;
  applyManagedStyles(styles: ManagedStyles): void;
}

export function compileWorkspaceProjection(
  snapshot: WorkspaceProjectionSource,
): WorkspaceProjectionPlan<CompiledManagedStyles> {
  const changes = [...snapshot.changes];
  const rules = buildManagedStyleRules(changes);
  return {
    sourceRevision: snapshot.revision,
    managedStyles: {
      rules,
      css: rulesToCssText(rules),
    },
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
export function applyWorkspaceProjection<ManagedStyles>(
  adapter: DocumentProjectionAdapter<ManagedStyles>,
  plan: WorkspaceProjectionPlan<ManagedStyles>,
): void {
  adapter.applyStructural(plan.structuralChanges);
  adapter.applyRenderedInstances(plan.instanceOverrides);
  adapter.applyText(plan.textContentChanges);
  adapter.applyComponents(plan.componentOverrides);
  adapter.applyManagedStyles(plan.managedStyles);
}

const hostDocumentProjectionAdapter: DocumentProjectionAdapter<CompiledManagedStyles> = {
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
  applyManagedStyles: (styles) => {
    applyRules([...styles.rules]);
  },
};

export function applyHostWorkspaceProjection(
  plan: WorkspaceProjectionPlan<CompiledManagedStyles>,
): void {
  applyWorkspaceProjection(hostDocumentProjectionAdapter, plan);
}
