/**
 * The one heading style on the Canvas, shared by a flow's title above its frames and a component sheet's title.
 * It lives in code rather than a stylesheet because the sheet renders in the app's own document, which never
 * loads the inspector's CSS.
 */
export function headingRule(selector: string, scale = "1"): string {
  return `${selector} { font-size: calc(24px * ${scale}); font-weight: 500; line-height: 1.2; letter-spacing: -0.01em; }`;
}
