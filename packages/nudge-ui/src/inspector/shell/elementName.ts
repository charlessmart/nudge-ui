const TAG_LABELS = new Map([
  ["a", "Link"],
  ["article", "Article"],
  ["body", "Page"],
  ["aside", "Aside"],
  ["button", "Button"],
  ["footer", "Footer"],
  ["form", "Form"],
  ["header", "Header"],
  ["img", "Image"],
  ["input", "Input"],
  ["label", "Label"],
  ["li", "List item"],
  ["main", "Main"],
  ["nav", "Navigation"],
  ["ol", "List"],
  ["p", "Paragraph"],
  ["section", "Section"],
  ["select", "Select"],
  ["svg", "Icon"],
  ["textarea", "Text area"],
  ["ul", "List"],
]);

export interface ElementName {
  readonly title: string;
}

/** The title is derived from the tag, with an accessible name when the author gave one. */
export function describeElement(element: HTMLElement): ElementName {
  const tag = element.localName.toLowerCase();
  const base = /^h[1-6]$/.test(tag) ? `Heading ${tag.slice(1)}` : TAG_LABELS.get(tag) ?? (tag.charAt(0).toUpperCase() + tag.slice(1));
  const accessible = element.getAttribute("aria-label")?.trim();
  return { title: accessible ? `${base} · ${accessible}` : base };
}
