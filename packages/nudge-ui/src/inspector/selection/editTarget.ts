/** Deliberately just the DOM nodes receiving a declaration; source metadata stays in the selection module. */
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
