import { rulesToCssText, type StyleRule } from "./managedStylesheet.ts";
import { collectRenderedInstanceOverrides } from "./renderedInstance.ts";
import type { RenderedInstanceOverride } from "../changes/editModel.ts";
import type { StructuralChange } from "./structuralProjection.ts";
import { collectTextContentChanges } from "./textProjection.ts";
import { componentChangeToOverride } from "../componentSemantics/changeModel.ts";
import type { ComponentOverride } from "../componentSemantics/types.ts";
import { isComponentChange, type TextContentChangeRecord } from "../changes/types.ts";
import { buildManagedStyleRules } from "../changes/managedStyleProjection.ts";
import type { DraftContents } from "../drafts/model.ts";
import {
  collectRuntimeIdentityClaims,
  type RuntimeIdentityClaim,
} from "../runtime/runtimeIdentityClaims.ts";

export interface DraftProjectionSource extends DraftContents {
  readonly revision: number;
}

export interface CompiledManagedStyles {
  readonly rules: readonly StyleRule[];
  readonly css: string;
}

export interface SerializedManagedStyles {
  readonly css: string;
}

export interface DraftProjectionPlan<ManagedStyles> {
  readonly sourceRevision: number;
  readonly managedStyles: ManagedStyles;
  readonly instanceOverrides: readonly RenderedInstanceOverride[];
  readonly structuralChanges: readonly StructuralChange[];
  readonly textContentChanges: readonly TextContentChangeRecord[];
  readonly componentOverrides: readonly ComponentOverride[];
  /** Omitted by hold-to-view-original plans, which keep the attached identities. */
  readonly runtimeIdentities?: readonly RuntimeIdentityClaim[];
}

export interface DocumentProjectionAdapter<ManagedStyles> {
  applyRuntimeIdentities(claims: readonly RuntimeIdentityClaim[]): void;
  applyStructural(changes: readonly StructuralChange[]): void;
  applyRenderedInstances(overrides: readonly RenderedInstanceOverride[]): void;
  applyText(changes: readonly TextContentChangeRecord[]): void;
  applyComponents(overrides: readonly ComponentOverride[]): void;
  applyManagedStyles(styles: ManagedStyles): void;
}

export function compileDraftProjection(
  snapshot: DraftProjectionSource,
): DraftProjectionPlan<CompiledManagedStyles> {
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
    runtimeIdentities: collectRuntimeIdentityClaims(snapshot),
  };
}

/** Order matters: identities first (selectors resolve by them), then structural, then managed CSS last (selectors use the instance markers above). */
export function applyDraftProjection<ManagedStyles>(
  adapter: DocumentProjectionAdapter<ManagedStyles>,
  plan: DraftProjectionPlan<ManagedStyles>,
): void {
  if (plan.runtimeIdentities) adapter.applyRuntimeIdentities(plan.runtimeIdentities);
  adapter.applyStructural(plan.structuralChanges);
  adapter.applyRenderedInstances(plan.instanceOverrides);
  adapter.applyText(plan.textContentChanges);
  adapter.applyComponents(plan.componentOverrides);
  adapter.applyManagedStyles(plan.managedStyles);
}
