export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function deeplyFocusedElement(): Element | null {
  let active: Element | null = typeof document === "undefined" ? null : document.activeElement;
  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  return active;
}

export function isEditableEvent(event: KeyboardEvent): boolean {
  return event.composedPath().some(isEditableTarget) || isEditableTarget(deeplyFocusedElement());
}

const TYPING_EVENTS = ["keydown", "keypress", "keyup"] as const;

/**
 * Keeps keys typed into the inspector's own fields from reaching the page's shortcuts. Past the shadow root an event is
 * retargeted to the host element, so a site's hotkeys (GitHub's `s` for search) can't tell the user is typing.
 * Capture-phase listeners above, including the inspector's own, still see every key.
 */
export function isolateTypingKeys(root: ShadowRoot): () => void {
  const stop = (event: Event): void => {
    if (event.composedPath().some(isEditableTarget)) event.stopPropagation();
  };
  for (const type of TYPING_EVENTS) root.addEventListener(type, stop);
  return () => {
    for (const type of TYPING_EVENTS) root.removeEventListener(type, stop);
  };
}

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

export function getPlatformModifierKey(): "⌘" | "Ctrl" {
  return isMacPlatform() ? "⌘" : "Ctrl";
}

export function getInspectorToggleShortcutLabel(): string {
  return `${getPlatformModifierKey()}\\`;
}

export const SEND_PROMPT_HOTKEY_EVENT = "nudge-ui-send-prompt-hotkey";

export function isSendPromptShortcut(event: KeyboardEvent): boolean {
  if (event.repeat || event.altKey || isEditableEvent(event)) return false;
  return event.shiftKey && !event.metaKey && !event.ctrlKey && event.code === "KeyS";
}

export function isInspectorToggleShortcut(event: KeyboardEvent): boolean {
  if (isEditableEvent(event)) return false;
  if (event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && event.code === "Backslash") return true;
  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.code === "Backslash") return true;
  return event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === "KeyI";
}

export function isOriginalPreviewShortcut(event: KeyboardEvent): boolean {
  if (event.repeat) return false;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
  if (event.code !== "Backslash") return false;
  return !isEditableEvent(event);
}
