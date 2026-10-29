export const MIN_ANIMATION_SPEED = 0.1;
export const MAX_ANIMATION_SPEED = 1;
/** The speed only moves in these steps: every tenth from 0.1× to full speed. */
export const ANIMATION_SPEED_STEP = 0.1;

/** Rounded so floating-point steps read as 0.3, not 0.30000000000000004. */
export function snapAnimationSpeed(speed: number): number {
  const snapped = Math.round(speed / ANIMATION_SPEED_STEP) * ANIMATION_SPEED_STEP;
  return Number(Math.min(MAX_ANIMATION_SPEED, Math.max(MIN_ANIMATION_SPEED, snapped)).toFixed(1));
}

/** Where a speed sits along a rail that runs from the slowest speed to full speed. */
export function animationSpeedToPosition(speed: number): number {
  return Math.min(1, Math.max(0, speed / MAX_ANIMATION_SPEED));
}

/** The speed at a point along the rail, snapped to the nearest tenth. */
export function animationSpeedAtPosition(position: number): number {
  return snapAnimationSpeed(position * MAX_ANIMATION_SPEED);
}

export function formatAnimationSpeed(speed: number): string {
  return `${speed}×`;
}
