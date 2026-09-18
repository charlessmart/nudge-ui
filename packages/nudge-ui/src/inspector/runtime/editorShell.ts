/** Returns whether a document is the application-free editor controller. */
export function isEditorShellDocument(doc: Document = document): boolean {
  return doc.documentElement.hasAttribute("data-nudge-ui-editor");
}
