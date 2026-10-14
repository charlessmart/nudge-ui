/** Editor-document CSP: the discarded application's scripts and assets are blocked; extension resources and frames are exempt. */
export const EDITOR_DOCUMENT_POLICY = [
  "script-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src blob:",
  "media-src 'none'",
  "font-src 'none'",
  "object-src 'none'",
  "frame-src 'self'",
].join("; ");
