import type { MeasurementSegment } from "../overlay/measurementGeometry.ts";
import type { Rect } from "../overlay/overlayGeometry.ts";

/**
 * Maps iframe-local measurement geometry into the Canvas board's screen
 * coordinate system. Distances deliberately remain in local CSS pixels so
 * their labels stay meaningful regardless of the board zoom.
 */
export function projectMeasurementSegments(
  iframeRect: Rect,
  segments: MeasurementSegment[],
  zoom: number,
): MeasurementSegment[] {
  const projectPoint = (point: MeasurementSegment["from"]): MeasurementSegment["from"] => ({
    x: iframeRect.left + point.x * zoom,
    y: iframeRect.top + point.y * zoom,
  });

  return segments.map((segment) => ({
    ...segment,
    from: projectPoint(segment.from),
    to: projectPoint(segment.to),
  }));
}
