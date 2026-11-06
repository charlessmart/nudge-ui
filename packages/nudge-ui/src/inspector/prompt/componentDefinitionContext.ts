import { isElementChange, type ChangeRecord } from "../changes/types.ts";
import { describeVariantScope } from "../componentSemantics/variantMarkers.ts";

/** Header lines for prompts built from the shared components draft. */
export function componentDefinitionContext(changes: readonly ChangeRecord[]): string[] {
  const sources = new Map<string, string>();
  for (const change of changes) {
    if (!("source" in change) || !change.source?.file) continue;
    const { file, line, component } = change.source;
    sources.set(`${file}:${line}`, component);
  }
  const variants = new Set<string>();
  for (const change of changes) {
    if (isElementChange(change) && change.variantScope) variants.add(describeVariantScope(change.variantScope));
  }
  return [
    "Source: Nudge's component library (shared component-definition changes).",
    "Edit the component's own implementation and styles so every usage changes; do not edit pages that use it.",
    ...(variants.size ? [
      "Some changes apply only to one variant (marked \"only for ...\"). Change that variant's own CSS or class, and leave the component's other variants as they are:",
      ...[...variants].map((variant) => `- ${variant}`),
    ] : []),
    ...(sources.size ? [
      "Components:",
      ...[...sources].map(([location, component]) => `- ${component ? `${component} at ` : ""}${location}`),
    ] : []),
  ];
}
