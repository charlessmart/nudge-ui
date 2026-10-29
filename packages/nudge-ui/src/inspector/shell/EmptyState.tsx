import type { ReactElement } from "react";
import { useCanvasPresentation } from "../canvas/viewStore.ts";
import { CANVAS_ILLUSTRATION_SVG } from "../ui/assets/canvasIllustration.ts";
import { GRID_ILLUSTRATION_SVG } from "../ui/assets/gridIllustration.ts";
import { getPlatformModifierKey, isMacPlatform } from "./shortcuts.ts";

export function EmptyState(): ReactElement {
  const presentation = useCanvasPresentation();
  const canvas = presentation === "canvas";
  const macPlatform = isMacPlatform();
  const modifierKey = getPlatformModifierKey();
  const modifierName = macPlatform ? "Command" : "Control";
  const optionKey = macPlatform ? "⌥" : "Alt";
  const optionName = macPlatform ? "Option" : "Alt";

  return (
    <div className="empty-state" data-test="empty-state">
      {canvas ? (
        <>
          <span className="empty-state__icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: CANVAS_ILLUSTRATION_SVG }} />
          <p className="empty-state__hint" data-test="canvas-intro">Hold <kbd>A</kbd> to click links and open them as new pages on the canvas.</p>
        </>
      ) : (
        <>
          <span className="empty-state__icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: GRID_ILLUSTRATION_SVG }} />
          <h2 className="empty-state__title">Select an element to edit</h2>
        </>
      )}
      <ul className="empty-state__shortcut-list" aria-label="Keyboard shortcuts">
        <li className="empty-state__shortcut" data-test="empty-state-shortcut"><span>Nudge</span><span className="empty-state__shortcut-keys" aria-label="Arrow keys"><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd></span></li>
        <li className="empty-state__shortcut" data-test="empty-state-shortcut"><span>Big Nudge (8px)</span><span className="empty-state__shortcut-keys" aria-label="Shift plus arrow keys"><kbd>Shift</kbd><span aria-hidden="true">+</span><kbd>Arrow</kbd></span></li>
        <li className="empty-state__shortcut" data-test="empty-state-shortcut"><span>Select deeper</span><span className="empty-state__shortcut-keys" aria-label={`${modifierName} plus click`}><kbd>{modifierKey}</kbd><span aria-hidden="true">+</span><kbd>Click</kbd></span></li>
        <li className="empty-state__shortcut" data-test="empty-state-shortcut"><span>Measure</span><span className="empty-state__shortcut-keys" aria-label={`${optionName} plus hover`}><kbd>{optionKey}</kbd><span aria-hidden="true">+</span><kbd>Hover</kbd></span></li>
        <li className="empty-state__shortcut" data-test="empty-state-shortcut"><span>Hide UI</span><span className="empty-state__shortcut-keys" aria-label={`${modifierName} plus backslash`}><kbd>{modifierKey}</kbd><span aria-hidden="true">+</span><kbd>\</kbd></span></li>
        <li className="empty-state__shortcut" data-test="empty-state-shortcut"><span>Hold to view original</span><span className="empty-state__shortcut-keys" aria-label="Backslash"><kbd>\</kbd></span></li>
        <li className="empty-state__shortcut" data-test="empty-state-shortcut"><span>Undo</span><span className="empty-state__shortcut-keys" aria-label={`${modifierName} plus Z`}><kbd>{modifierKey}</kbd><span aria-hidden="true">+</span><kbd>Z</kbd></span></li>
        <li className="empty-state__shortcut" data-test="empty-state-shortcut"><span>Deselect</span><span className="empty-state__shortcut-keys"><kbd>Esc</kbd></span></li>
      </ul>
    </div>
  );
}
