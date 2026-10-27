/** The virtual cursor never travels further than this from where the drag began. */
const MAX_OFFSET_PX = 8;
/** Tuned so 200px of real travel gives ~4px and 800px gives ~6px, easing towards the cap. */
const OFFSET_SCALE = 1.5;
const OFFSET_KNEE_PX = 15;
/** The virtual cursor roams further than the icon and edge, which stay at the base offset. */
const CURSOR_RATIO = 2;
/** Holding shift multiplies the cursor travel and edge stretch (the icon stays put). */
const SHIFT_BOOST = 3;
/** The icon moves less than the virtual cursor so it only hints at the pull. */
const ICON_SHIFT_RATIO = 0.5;
/** The field edge leans less than the icon, so it reads as a slight morph rather than a slide. */
const EDGE_STRETCH_RATIO = 0.6;

/** Pushing on against a limit adds this much more pull, on a stiffer curve than free travel. */
const WALL_MAX_OFFSET_PX = 5;
const WALL_OFFSET_SCALE = 1.6;
const WALL_KNEE_PX = 10;

const SPRING_STIFFNESS = 320;
const SPRING_DAMPING = 20;
const REST_PX = 0.01;

/** Logarithmic falloff: net real pointer travel in, capped signed virtual offset out. */
export function elasticOffset(travel: number): number {
  const magnitude = Math.min(MAX_OFFSET_PX, OFFSET_SCALE * Math.log(1 + Math.abs(travel) / OFFSET_KNEE_PX));
  return Math.sign(travel) * magnitude;
}

/** Extra pull for pointer travel that the value could not follow: signed overshoot in, capped signed offset out. */
export function wallOffset(overshoot: number): number {
  const magnitude = Math.min(WALL_MAX_OFFSET_PX, WALL_OFFSET_SCALE * Math.log(1 + Math.abs(overshoot) / WALL_KNEE_PX));
  return Math.sign(overshoot) * magnitude;
}

export interface ElasticDrag {
  /** `travel` is the net signed pointer travel since the drag began that the value followed; `overshoot` is the signed travel pushed on against a limit. */
  update(travel: number, boosted?: boolean, overshoot?: number): void;
  /** Springs the offset back to rest. */
  release(): void;
  /** Drops the offset immediately. */
  cancel(): void;
}

function prefersReducedMotion(surface: HTMLElement): boolean {
  return surface.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * Shifts a field's icon and pulls its left edge along with the drag: in when dragging right, out when dragging left.
 * The icon's transform is set on the icon itself, so each frame restyles one element rather than the whole field; the
 * edge is the surface's own, through `--nudge-stretch`.
 */
export function createElasticDrag(surface: HTMLElement, icon: HTMLElement, onOffset: (offset: number) => void): ElasticDrag {
  const win = surface.ownerDocument.defaultView;
  const reduced = prefersReducedMotion(surface);
  let offset = 0;
  let velocity = 0;
  let frame = 0;
  let boost = 1;

  function apply(next: number): void {
    offset = next;
    icon.style.transform = `translateX(${next * ICON_SHIFT_RATIO}px)`;
    surface.style.setProperty("--nudge-stretch", `${Math.abs(next) * EDGE_STRETCH_RATIO * boost}px`);
    surface.setAttribute("data-nudge-elastic", next < 0 ? "out" : "in");
    onOffset(next * CURSOR_RATIO * boost);
  }

  function clear(): void {
    if (frame) win?.cancelAnimationFrame(frame);
    frame = 0;
    velocity = 0;
    offset = 0;
    surface.removeAttribute("data-nudge-elastic");
    icon.style.removeProperty("transform");
    surface.style.removeProperty("--nudge-stretch");
    onOffset(0);
  }

  return {
    update(travel, boosted = false, overshoot = 0) {
      if (reduced) return;
      boost = boosted ? SHIFT_BOOST : 1;
      if (frame) win?.cancelAnimationFrame(frame);
      frame = 0;
      apply(elasticOffset(travel) + wallOffset(overshoot));
    },
    release() {
      if (!win || (offset === 0 && !frame)) return clear();
      let last = performance.now();
      const step = (now: number): void => {
        const dt = Math.min(0.032, (now - last) / 1000);
        last = now;
        velocity += (-SPRING_STIFFNESS * offset - SPRING_DAMPING * velocity) * dt;
        const next = offset + velocity * dt;
        if (Math.abs(next) < REST_PX && Math.abs(velocity) < 0.05) return clear();
        apply(next);
        frame = win.requestAnimationFrame(step);
      };
      frame = win.requestAnimationFrame(step);
    },
    cancel: clear,
  };
}
