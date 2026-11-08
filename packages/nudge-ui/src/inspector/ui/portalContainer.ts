import { createContext, useContext } from "react";

/** Portal target inside the inspector's shadow root, so popups inherit its styles. */
export function portalContainer(): HTMLElement | ShadowRoot | null {
  if (typeof document === "undefined") return null;
  return document.getElementById("nudge-ui-root")?.shadowRoot ?? document.body;
}

/**
 * Inspector controls rendered outside the inspector's own shadow root (the component sheet's background picker, which
 * lives in the application's document) provide the shadow root holding their copy of the inspector styles.
 */
export const PortalContainerContext = createContext<HTMLElement | ShadowRoot | null>(null);

export function usePortalContainer(): HTMLElement | ShadowRoot | null {
  return useContext(PortalContainerContext) ?? portalContainer();
}
