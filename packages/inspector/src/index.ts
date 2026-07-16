import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { InspectorShell, toggleInspector, setInspectorOpen, setInspectorHost } from "./InspectorShell.tsx";
import { setSelectedElement } from "./selectionStore.ts";
import { clearChanges } from "./changesLog.ts";
import { removeManagedSheet } from "./managedStylesheet.ts";
import { isInspectorToggleShortcut } from "./shortcuts.ts";

let hostElement: HTMLElement | null = null;
let reactRoot: Root | null = null;
let listenerAttached = false;

function onKeydown(e: KeyboardEvent): void {
  if (isInspectorToggleShortcut(e)) {
    toggleInspector();
    e.preventDefault();
  }
}

export function mountInspector(host: HTMLElement): void {
  if (!hostElement) hostElement = host;
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  if (!reactRoot) {
    reactRoot = createRoot(shadow);
    setInspectorHost(host);
    reactRoot.render(createElement(InspectorShell));
  }
  setInspectorOpen(true);
  if (!listenerAttached) {
    window.addEventListener("keydown", onKeydown);
    listenerAttached = true;
  }
}

export function unmountInspector(): void {
  if (listenerAttached) {
    window.removeEventListener("keydown", onKeydown);
    listenerAttached = false;
  }
  setSelectedElement(null);
  if (reactRoot) {
    reactRoot.unmount();
    reactRoot = null;
  }
  clearChanges();
  removeManagedSheet();
  hostElement = null;
}

export { toggleInspector, setInspectorOpen } from "./InspectorShell.tsx";
export { InspectorShell } from "./InspectorShell.tsx";
