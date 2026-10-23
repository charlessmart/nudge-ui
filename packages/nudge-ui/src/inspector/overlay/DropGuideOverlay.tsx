import type { CSSProperties, ReactElement } from "react";
import type { DropGuideRect } from "./dropGuide.ts";

export interface ViewportDropGuide {
  orientation: "horizontal" | "vertical";
  line: DropGuideRect;
  target?: DropGuideRect;
  label?: string;
}

interface DropGuideOverlayProps {
  guide: ViewportDropGuide | null;
  lineClassName: string;
  lineTestId: string;
  targetClassName?: string;
  targetTestId?: string;
  labelClassName?: string;
  labelTestId?: string;
}

const LABEL_HEIGHT = 20;

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
  labelClassName,
  labelTestId,
}: DropGuideOverlayProps): ReactElement | null {
  if (!guide) return null;
  return (
    <>
      {guide.target && targetClassName && targetTestId ? (
        <div className={targetClassName} data-test={targetTestId} style={fixedRect(guide.target)} aria-hidden="true" />
      ) : null}
      {guide.target && guide.label && labelClassName && labelTestId ? (
        <div
          className={labelClassName}
          data-test={labelTestId}
          style={{
            position: "fixed",
            left: guide.target.left,
            // Above the target, or inside its top edge when the target touches the top of the viewport.
            top: guide.target.top >= LABEL_HEIGHT + 2 ? guide.target.top - LABEL_HEIGHT - 2 : guide.target.top + 2,
            height: LABEL_HEIGHT,
            pointerEvents: "none",
          }}
          aria-hidden="true"
        >
          {guide.label}
        </div>
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
