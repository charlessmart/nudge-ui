import type { CSSProperties, ReactElement } from "react";
import type { DropGuideRect } from "./dropGuide.ts";

export interface ViewportDropGuide {
  orientation: "horizontal" | "vertical";
  line: DropGuideRect;
  target?: DropGuideRect;
}

interface DropGuideOverlayProps {
  guide: ViewportDropGuide | null;
  lineClassName: string;
  lineTestId: string;
  targetClassName?: string;
  targetTestId?: string;
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

/** Shared visual wrapper; each view only supplies its projected viewport geometry. */
export function DropGuideOverlay({
  guide,
  lineClassName,
  lineTestId,
  targetClassName,
  targetTestId,
}: DropGuideOverlayProps): ReactElement | null {
  if (!guide) return null;
  return (
    <>
      {guide.target && targetClassName && targetTestId ? (
        <div className={targetClassName} data-test={targetTestId} style={fixedRect(guide.target)} aria-hidden="true" />
      ) : null}
      <div
        className={lineClassName}
        data-test={lineTestId}
        data-orientation={guide.orientation}
        style={fixedRect(guide.line)}
        aria-hidden="true"
      />
    </>
  );
}
