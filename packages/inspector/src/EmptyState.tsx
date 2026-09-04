import type { ReactElement } from "react";
import { IconPointer } from "@tabler/icons-react";

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

export function EmptyState(): ReactElement {
  const macPlatform = isMacPlatform();
  const modifierKey = macPlatform ? "⌘" : "Ctrl";
  const modifierName = macPlatform ? "Command" : "Control";
  const optionKey = macPlatform ? "⌥" : "Alt";
  const optionName = macPlatform ? "Option" : "Alt";

  return (
    <div className="empty-state" data-test="empty-state">
      <div className="empty-state__icon" aria-hidden="true">
        <IconPointer size="var(--icon-size-large)" stroke="var(--icon-stroke-width)" />
      </div>
      <h2 className="empty-state__title">Select an element to edit</h2>
      <div className="empty-state__shortcuts">
        <ul className="empty-state__shortcut-list">
          <li className="empty-state__shortcut" data-test="empty-state-shortcut"><span>Nudge</span><span className="empty-state__shortcut-keys" aria-label="Arrow keys"><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd></span></li>
          <li className="empty-state__shortcut" data-test="empty-state-shortcut"><span>Big Nudge (8px)</span><span className="empty-state__shortcut-keys" aria-label="Shift plus arrow keys"><kbd>Shift</kbd><span aria-hidden="true">+</span><kbd>Arrow</kbd></span></li>
          <li className="empty-state__shortcut" data-test="empty-state-shortcut"><span>Select deeper</span><span className="empty-state__shortcut-keys" aria-label={`${modifierName} plus click`}><kbd>{modifierKey}</kbd><span aria-hidden="true">+</span><kbd>Click</kbd></span></li>
          <li className="empty-state__shortcut" data-test="empty-state-shortcut"><span>Measure</span><span className="empty-state__shortcut-keys" aria-label={`${optionName} plus hover`}><kbd>{optionKey}</kbd><span aria-hidden="true">+</span><kbd>Hover</kbd></span></li>
          <li className="empty-state__shortcut" data-test="empty-state-shortcut"><span>Hide UI</span><span className="empty-state__shortcut-keys" aria-label={`${modifierName} plus backslash`}><kbd>{modifierKey}</kbd><span aria-hidden="true">+</span><kbd>\</kbd></span></li>
          <li className="empty-state__shortcut" data-test="empty-state-shortcut"><span>Undo</span><span className="empty-state__shortcut-keys" aria-label={`${modifierName} plus Z`}><kbd>{modifierKey}</kbd><span aria-hidden="true">+</span><kbd>Z</kbd></span></li>
          <li className="empty-state__shortcut" data-test="empty-state-shortcut"><span>Deselect</span><span className="empty-state__shortcut-keys"><kbd>Esc</kbd></span></li>
        </ul>
      </div>
    </div>
  );
}
