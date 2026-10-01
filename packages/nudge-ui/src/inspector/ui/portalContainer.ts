/** Portal target inside the inspector's shadow root, so popups inherit its styles. */
export function portalContainer(): HTMLElement | ShadowRoot | null {
  if (typeof document === "undefined") return null;
  return document.getElementById("nudge-ui-root")?.shadowRoot ?? document.body;
}
