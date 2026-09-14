import type { DefaultTreeAdapterTypes } from "parse5";

export const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

/** Elements that never carry identity: they render nothing a user can select. */
export const EXCLUDED_TAG_NAMES = new Set([
  "html",
  "head",
  "body",
  "script",
  "style",
  "template",
  "noscript",
]);

export type HtmlElement = DefaultTreeAdapterTypes.Element;
export type ElementLocation = NonNullable<HtmlElement["sourceCodeLocation"]>;
export type StartTagLocation = NonNullable<ElementLocation["startTag"]>;

export function isElement(node: DefaultTreeAdapterTypes.ChildNode): node is HtmlElement {
  return "tagName" in node && typeof node.tagName === "string";
}

export function hasAttribute(element: HtmlElement, name: string, value?: string): boolean {
  const attribute = element.attrs.find((candidate) => candidate.name === name);
  return attribute !== undefined && (value === undefined || attribute.value === value);
}

export function getAttributeValue(element: HtmlElement, name: string): string | undefined {
  return element.attrs.find((candidate) => candidate.name === name)?.value;
}

/** Every `<body>` in the document, skipping inert `<template>` content. */
export function findBodyElements(
  document: DefaultTreeAdapterTypes.Document,
): HtmlElement[] {
  const bodies: HtmlElement[] = [];

  const visit = (parent: DefaultTreeAdapterTypes.ParentNode): void => {
    for (const child of parent.childNodes) {
      if (!isElement(child)) continue;
      if (child.tagName.toLowerCase() === "template") continue;
      if (child.tagName === "body" && child.namespaceURI === HTML_NAMESPACE) {
        bodies.push(child);
      }
      visit(child);
    }
  };

  visit(document);
  return bodies;
}

export function escapeAttributeValue(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
