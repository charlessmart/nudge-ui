import { elasticOffset } from "../tokens/dragElastic.ts";

/** Reuses the token fields' elastic curve as is, so an overshoot pulls the rail out by at most 8px. */
const STRETCH_RATIO = 1;

/**
 * Pulls a rail out past the end the pointer has overshot, through `--stretch-start` and `--stretch-end` on the element
 * and `data-stretching` while it is pulled. A null pointer (a release) clears them so the CSS springs it back.
 */
export function stretchSlider(slider: HTMLElement, clientX: number | null): void {
  const rect = slider.getBoundingClientRect();
  const overshoot = clientX === null ? 0 : clientX < rect.left ? clientX - rect.left : Math.max(0, clientX - rect.right);
  const reduced = slider.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const stretch = overshoot === 0 || reduced ? 0 : Math.abs(elasticOffset(overshoot)) * STRETCH_RATIO;
  slider.toggleAttribute("data-stretching", stretch > 0);
  slider.style.setProperty("--stretch-start", `${overshoot < 0 ? stretch : 0}px`);
  slider.style.setProperty("--stretch-end", `${overshoot > 0 ? stretch : 0}px`);
}
