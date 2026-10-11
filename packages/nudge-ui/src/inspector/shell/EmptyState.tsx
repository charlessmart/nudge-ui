import type { ReactElement } from "react";
import { IconAdjustmentsHorizontal, IconBoltFilled, IconRoute } from "@tabler/icons-react";
import { useCanvasPresentation } from "../canvas/viewStore.ts";
import { Disclosure } from "../ui/Disclosure.tsx";
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
    <div className={`empty-state${canvas ? " empty-state--canvas" : ""}`} data-test="empty-state">
      {canvas ? (
        <div className="empty-state__canvas" data-test="canvas-intro">
          <h2 className="empty-state__title">Using the canvas</h2>
          <p><span className="empty-state__live-badge"><IconBoltFilled aria-hidden="true" /></span><span><strong>Live app</strong>A view of your running app.</span></p>
          <p><IconAdjustmentsHorizontal aria-hidden="true" /><span><strong>Preview changes</strong>Select elements to edit styles, text and layout on the canvas.</span></p>
          <p><IconRoute aria-hidden="true" /><span><strong>Preview flows</strong>Follow links to open new pages on the canvas and preview flows.</span></p>
        </div>
      ) : (
        <>
          <span className="empty-state__icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: GRID_ILLUSTRATION_SVG }} />
          <h2 className="empty-state__title">Select an element to edit</h2>
        </>
      )}
      <Disclosure
        key={presentation}
        className="empty-state__shortcuts"
        title="Keyboard shortcuts"
        triggerDataTest="empty-state-shortcuts-toggle"
        defaultOpen={!canvas}
      >
        <ul className="empty-state__shortcut-list">
          <li className="empty-state__shortcut" data-test="empty-state-shortcut"><span>Nudge</span><span className="empty-state__shortcut-keys" aria-label="Arrow keys"><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd></span></li>
          <li className="empty-state__shortcut" data-test="empty-state-shortcut"><span>Big Nudge (8px)</span><span className="empty-state__shortcut-keys" aria-label="Shift plus arrow keys"><kbd>Shift</kbd><span aria-hidden="true">+</span><kbd>Arrow</kbd></span></li>
          <li className="empty-state__shortcut" data-test="empty-state-shortcut"><span>Select deeper</span><span className="empty-state__shortcut-keys" aria-label={`${modifierName} plus click`}><kbd>{modifierKey}</kbd><span aria-hidden="true">+</span><kbd>Click</kbd></span></li>
          <li className="empty-state__shortcut" data-test="empty-state-shortcut"><span>Measure</span><span className="empty-state__shortcut-keys" aria-label={`${optionName} plus hover`}><kbd>{optionKey}</kbd><span aria-hidden="true">+</span><kbd>Hover</kbd></span></li>
          <li className="empty-state__shortcut" data-test="empty-state-shortcut"><span>Hide UI</span><span className="empty-state__shortcut-keys" aria-label={`${modifierName} plus backslash`}><kbd>{modifierKey}</kbd><span aria-hidden="true">+</span><kbd>\</kbd></span></li>
          <li className="empty-state__shortcut" data-test="empty-state-shortcut"><span>Hold to view original</span><span className="empty-state__shortcut-keys" aria-label="Backslash"><kbd>\</kbd></span></li>
          <li className="empty-state__shortcut" data-test="empty-state-shortcut"><span>Undo</span><span className="empty-state__shortcut-keys" aria-label={`${modifierName} plus Z`}><kbd>{modifierKey}</kbd><span aria-hidden="true">+</span><kbd>Z</kbd></span></li>
          <li className="empty-state__shortcut" data-test="empty-state-shortcut"><span>Deselect</span><span className="empty-state__shortcut-keys"><kbd>Esc</kbd></span></li>
        </ul>
      </Disclosure>
    </div>
  );
}
