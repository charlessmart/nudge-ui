export function isEditorShellDocument(doc: Document = document): boolean {
  return doc.documentElement.hasAttribute("data-nudge-ui-editor");
}
