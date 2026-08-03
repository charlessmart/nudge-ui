export interface AuthorCascadePriority {
  important?: boolean;
  inline?: boolean;
  layer?: string;
  layerOrder?: number;
  specificity: number;
  sourceOrder: number;
}

/**
 * Compares declarations from the author origin. Positive means `a` wins.
 * Normal declarations prefer unlayered rules and later layers; important
 * declarations reverse both relationships as required by the CSS cascade.
 */
export function compareAuthorCascade(
  a: AuthorCascadePriority,
  b: AuthorCascadePriority,
): number {
  const aImportant = Boolean(a.important);
  const bImportant = Boolean(b.important);
  if (aImportant !== bImportant) return aImportant ? 1 : -1;

  const aInline = Boolean(a.inline);
  const bInline = Boolean(b.inline);
  if (aInline !== bInline) return aInline ? 1 : -1;

  const aLayered = a.layer !== undefined;
  const bLayered = b.layer !== undefined;
  if (aLayered !== bLayered) {
    if (aImportant) return aLayered ? 1 : -1;
    return aLayered ? -1 : 1;
  }

  if (aLayered && bLayered && a.layer !== b.layer) {
    const aOrder = a.layerOrder ?? a.sourceOrder;
    const bOrder = b.layerOrder ?? b.sourceOrder;
    if (aOrder !== bOrder) return aImportant ? bOrder - aOrder : aOrder - bOrder;
  }

  if (a.specificity !== b.specificity) return a.specificity - b.specificity;
  return a.sourceOrder - b.sourceOrder;
}
