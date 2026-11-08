import { elasticOffset } from "../tokens/dragElastic.ts";

/** Reuses the token fields' elastic curve as is, so an overshoot pulls the rail out by at most 8px. */
const STRETCH_RATIO = 1;

/**
 * Pulls a rail out past the end the pointer has overshot, through `--stretch-start` and `--stretch-end` on the element
 * and `data-stretching` while it is pulled. The rail itself stretches on a scale, `--stretch-scale`, anchored at the
 * opposite end by `--stretch-origin`. A null pointer (a release) clears them so the CSS springs it back; the origin is
 * kept so the rail springs back toward the same end.
 */
export function stretchSlider(slider: HTMLElement, clientX: number | null): void {
  const rect = slider.getBoundingClientRect();
  const overshoot = clientX === null ? 0 : clientX < rect.left ? clientX - rect.left : Math.max(0, clientX - rect.right);
  const reduced = slider.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const stretch = overshoot === 0 || reduced ? 0 : Math.abs(elasticOffset(overshoot)) * STRETCH_RATIO;
  slider.toggleAttribute("data-stretching", stretch > 0);
  // The rail runs past the element by its inline margins (the slider's half-thumb edge; none for a gradient track).
  const style = slider.ownerDocument.defaultView?.getComputedStyle(slider);
  const railWidth = rect.width + (Number.parseFloat(style?.marginLeft ?? "") || 0) + (Number.parseFloat(style?.marginRight ?? "") || 0);
  slider.style.setProperty("--stretch-scale", railWidth > 0 ? String((railWidth + stretch) / railWidth) : "1");
  if (stretch > 0) slider.style.setProperty("--stretch-origin", overshoot < 0 ? "right" : "left");
  slider.style.setProperty("--stretch-start", `${overshoot < 0 ? stretch : 0}px`);
  slider.style.setProperty("--stretch-end", `${overshoot > 0 ? stretch : 0}px`);
}
