/**
 * A style edit target is deliberately smaller than the selection model. The
 * editor only needs the rendered DOM nodes that will receive one declaration;
 * source metadata and selection ordering stay inside the selection module.
 */
export type EditTarget = HTMLElement | readonly HTMLElement[];

function isElementList(target: EditTarget): target is readonly HTMLElement[] {
  return Array.isArray(target);
}

export function targetElements(target: EditTarget): readonly HTMLElement[] {
  if (isElementList(target)) return target;
  return [target];
}

export function isMultiTarget(target: EditTarget): boolean {
  return targetElements(target).length > 1;
}
