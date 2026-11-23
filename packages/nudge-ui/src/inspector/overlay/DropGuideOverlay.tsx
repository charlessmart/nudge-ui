import type { CSSProperties, ReactElement } from "react";
import type { DropGuideRect } from "./dropGuide.ts";

export interface ViewportDropGuide {
  orientation: "horizontal" | "vertical";
  line: DropGuideRect;
  target?: DropGuideRect;
  /** Where the dropped element would sit; shown in place of the line when present. */
  slot?: DropGuideRect;
}

interface DropGuideOverlayProps {
  guide: ViewportDropGuide | null;
  lineClassName: string;
  lineTestId: string;
  targetClassName?: string;
  targetTestId?: string;
  slotClassName?: string;
  slotTestId?: string;
}

function fixedRect(rect: DropGuideRect): CSSProperties {
  return {
    position: "fixed",
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    pointerEvents: "none",
  };
}

export function DropGuideOverlay({
  guide,
  lineClassName,
  lineTestId,
  targetClassName,
  targetTestId,
  slotClassName,
  slotTestId,
}: DropGuideOverlayProps): ReactElement | null {
  if (!guide) return null;
  return (
    <>
      {guide.target && targetClassName && targetTestId ? (
        <div className={targetClassName} data-test={targetTestId} style={fixedRect(guide.target)} aria-hidden="true" />
      ) : null}
      {guide.slot && slotClassName && slotTestId ? (
        <div className={slotClassName} data-test={slotTestId} style={fixedRect(guide.slot)} aria-hidden="true" />
      ) : (
        <div
          className={lineClassName}
          data-test={lineTestId}
          data-orientation={guide.orientation}
          style={fixedRect(guide.line)}
          aria-hidden="true"
        />
      )}
    </>
  );
}
