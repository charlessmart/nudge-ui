/**
 * Blocks the discarded application's scripts and assets in the editor document.
 * Extension scripts and resources are exempt; frames may load the application.
 * Sketch previews use local blob URLs.
 */
export const EDITOR_DOCUMENT_POLICY = [
  "script-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src blob:",
  "media-src 'none'",
  "font-src 'none'",
  "object-src 'none'",
  "frame-src 'self'",
].join("; ");
