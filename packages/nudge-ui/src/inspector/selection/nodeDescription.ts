/** The tag, id and first two classes (`button#save.btn.primary`), as the DOM navigator menu and the inspector title show an element. */
export function describeNode(node: HTMLElement): string {
  const id = node.id ? `#${node.id}` : "";
  const className = typeof node.className === "string"
    ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((name) => `.${name}`).join("")
    : "";
  return `${node.localName}${id}${className}`;
}
