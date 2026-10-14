const activePreviews = new WeakMap<HTMLElement, Set<string>>();

/** Marks a temporary inline preview so layout fields do not treat it as authored CSS. */
export function beginLayoutPreview(el: HTMLElement, property: string): void {
  const properties = activePreviews.get(el) ?? new Set<string>();
  properties.add(property);
  activePreviews.set(el, properties);
}

export function endLayoutPreview(el: HTMLElement, property: string): void {
  const properties = activePreviews.get(el);
  if (!properties) return;
  properties.delete(property);
  if (properties.size === 0) activePreviews.delete(el);
}

export function isLayoutPreview(el: HTMLElement, property: string): boolean {
  return activePreviews.get(el)?.has(property) ?? false;
}
