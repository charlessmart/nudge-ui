import type { ReactElement } from "react";
import { IconArtboard, IconBoltFilled, IconLink, IconSparkles } from "@tabler/icons-react";
import { useCanvasPresentation } from "../canvas/canvasStore.ts";
import { Disclosure } from "../ui/Disclosure.tsx";
import gridIllustration from "../ui/assets/grid.svg";
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
          <h2 className="empty-state__title">Room to explore</h2>
          <p><span className="empty-state__live-badge"><IconBoltFilled aria-hidden="true" /></span><span><strong>Live app</strong>Edit your real page.</span></p>
          <p><IconLink aria-hidden="true" /><span><strong>Linked frames</strong>Compare sizes. Share edits.</span></p>
          <p><IconArtboard aria-hidden="true" /><span><strong>HTML studies</strong>Try an independent design.</span></p>
          <p><IconSparkles aria-hidden="true" /><span><strong>Your agent</strong>Make changes. Bring pages here.</span></p>
        </div>
      ) : (
        <>
          <img className="empty-state__icon" src={gridIllustration} alt="" aria-hidden="true" />
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
