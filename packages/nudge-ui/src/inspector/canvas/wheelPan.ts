/** Scales the browser's wheel delta so a scroll pans the canvas further than the page would move. */
export const PAN_WHEEL_SPEED = 1.5;

/** deltaMode 1 is lines (16px) and 2 is pages, so both need converting to pixels. */
export function wheelPanDelta(
  event: Pick<WheelEvent, "deltaX" | "deltaY" | "deltaMode" | "shiftKey">,
  viewport: { width: number; height: number },
): { x: number; y: number } {
  const xUnit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.width : 1;
  const yUnit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.height : 1;
  const x = event.deltaX * xUnit * PAN_WHEEL_SPEED;
  const y = event.deltaY * yUnit * PAN_WHEEL_SPEED;
  return event.shiftKey && x === 0 ? { x: y, y: 0 } : { x, y };
}
