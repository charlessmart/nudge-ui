import { getElementComputedStyle } from "../runtime/domRealm.ts";

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

/** The simplest whole-number ratio of two measured sides, or null when either has no size. */
export function reduceAspectRatio(width: number, height: number): string | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const wholeWidth = Math.round(width);
  const wholeHeight = Math.round(height);
  if (wholeWidth < 1 || wholeHeight < 1) return null;
  const divisor = greatestCommonDivisor(wholeWidth, wholeHeight);
  return `${wholeWidth / divisor} / ${wholeHeight / divisor}`;
}

/** The used size of the element as a CSS aspect-ratio, so a page-sized element locks to its own proportions. */
export function measureAspectRatio(el: HTMLElement): string | null {
  try {
    const computed = getElementComputedStyle(el);
    return reduceAspectRatio(Number.parseFloat(computed.width), Number.parseFloat(computed.height));
  } catch {
    return null;
  }
}
