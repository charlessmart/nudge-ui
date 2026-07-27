import { useEffect, useState, type ReactElement } from "react";
import type { Rect } from "./overlayGeometry.ts";
import type { MeasurementSegment } from "./measurementGeometry.ts";

interface MeasurementGuideOverlayProps {
  /** The selected element in the overlay's screen coordinate system. */
  selectedRect: Rect;
  /** The viewport that alignment guides should span. */
  guideViewport?: Rect;
  /** Measurement geometry in the overlay's screen coordinate system. */
  segments: MeasurementSegment[];
  testId?: string;
}

/**
 * Renders measurement geometry over a viewport. The Inspect surface passes
 * browser coordinates directly; Canvas projects iframe-local coordinates into
 * the same screen coordinate system before rendering here.
 */
export function MeasurementGuideOverlay({
  selectedRect,
  guideViewport,
  segments,
  testId = "measurement-overlay",
}: MeasurementGuideOverlayProps): ReactElement {
  const [windowViewport, setWindowViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  useEffect(() => {
    function updateViewport(): void {
      setWindowViewport({ width: window.innerWidth, height: window.innerHeight });
    }
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  const resolvedGuideViewport = guideViewport ?? {
    left: 0,
    top: 0,
    width: windowViewport.width,
    height: windowViewport.height,
  };
  const guideRight = resolvedGuideViewport.left + resolvedGuideViewport.width;
  const guideBottom = resolvedGuideViewport.top + resolvedGuideViewport.height;
  const selectedRight = selectedRect.left + selectedRect.width;
  const selectedBottom = selectedRect.top + selectedRect.height;

  return (
    <svg
      className="dt-measurement-overlay"
      data-test={testId}
      width={windowViewport.width}
      height={windowViewport.height}
      viewBox={`0 0 ${windowViewport.width} ${windowViewport.height}`}
      aria-hidden="true"
    >
      <line className="dt-alignment-guide" x1={resolvedGuideViewport.left} y1={selectedRect.top} x2={guideRight} y2={selectedRect.top} />
      <line className="dt-alignment-guide" x1={resolvedGuideViewport.left} y1={selectedBottom} x2={guideRight} y2={selectedBottom} />
      <line className="dt-alignment-guide" x1={selectedRect.left} y1={resolvedGuideViewport.top} x2={selectedRect.left} y2={guideBottom} />
      <line className="dt-alignment-guide" x1={selectedRight} y1={resolvedGuideViewport.top} x2={selectedRight} y2={guideBottom} />
      {segments.map((segment) => {
        const labelX = (segment.from.x + segment.to.x) / 2;
        const labelY = (segment.from.y + segment.to.y) / 2;
        const isHorizontal = segment.axis === "horizontal";
        const labelText = segment.distance === undefined ? null : `${Math.round(segment.distance)}px`;
        const labelWidth = labelText ? labelText.length * 7 + 10 : 0;
        const textX = isHorizontal ? labelX : labelX + 6;
        const textY = isHorizontal ? labelY - 6 : labelY + 4;
        return (
          <g key={segment.id}>
            <line
              className={segment.kind === "projection" ? "dt-measurement-projection" : "dt-measurement-ruler"}
              data-test={segment.kind === "projection" ? "measurement-projection" : "measurement-ruler"}
              data-segment-id={segment.id}
              data-axis={segment.axis}
              x1={segment.from.x}
              y1={segment.from.y}
              x2={segment.to.x}
              y2={segment.to.y}
            />
            {labelText ? (
              <>
                <rect
                  className="dt-measurement-label-chip"
                  data-test="measurement-label-chip"
                  x={isHorizontal ? textX - labelWidth / 2 : textX - 4}
                  y={textY - 12}
                  width={labelWidth}
                  height="16"
                  rx="2"
                />
                <text
                  className="dt-measurement-label"
                  data-test="measurement-label"
                  x={textX}
                  y={textY}
                  textAnchor={isHorizontal ? "middle" : "start"}
                >
                  {labelText}
                </text>
              </>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
