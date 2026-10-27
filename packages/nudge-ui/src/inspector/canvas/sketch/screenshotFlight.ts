import { portalContainer } from "../../ui/portalContainer.ts";
import type { ScreenshotArea } from "./screenshot.ts";

const FLIGHT_MS = 480;
/** The tilt the picture lands with, like a print dropped on a desk. */
const LANDING_TURN_DEG = -8;
/** Width of the picture when it lands on the screenshot button. */
const LANDING_WIDTH_PX = 40;
const LANDING_PAUSE_MS = 80;

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Shows the screenshot where it was taken, then shrinks it down onto `target` (the screenshot button) with a little
 * turn and a grey tint, so the user sees what went to the clipboard. Resolves once it has landed; skipped when motion
 * is reduced or there is nowhere to land.
 */
export async function flyScreenshot(picture: HTMLCanvasElement, from: ScreenshotArea, target: Element | null): Promise<void> {
  const container = portalContainer();
  if (!container || !target || prefersReducedMotion() || typeof Element.prototype.animate !== "function") return;
  if (target.getBoundingClientRect().width <= 0 || from.width <= 0) return;

  const card = document.createElement("div");
  card.className = "sketch-flight";
  card.setAttribute("aria-hidden", "true");
  Object.assign(card.style, {
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
  });
  // The cropped frame itself, so the flight starts while the PNG is still encoding.
  picture.classList.add("sketch-flight__image");
  const tint = document.createElement("div");
  tint.className = "sketch-flight__tint";
  card.append(picture, tint);

  /** Keyframes towards the button's centre where it is now. */
  const keyframes = (): Keyframe[] => {
    const to = target.getBoundingClientRect();
    const scale = LANDING_WIDTH_PX / from.width;
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    return [
      { transform: "none", opacity: 1, offset: 0 },
      // A beat at full size, lifted slightly, so the whole picture reads before it goes.
      { transform: "scale(0.94) rotate(-2deg)", opacity: 1, offset: 0.25 },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(${LANDING_TURN_DEG}deg)`, opacity: 1, offset: 0.92 },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale * 0.6}) rotate(${LANDING_TURN_DEG}deg)`, opacity: 0, offset: 1 },
    ];
  };
  let flight: Animation | null = null;
  // Chromium removes its sharing bar as the share ends, which grows the tab and moves the toolbar down mid-flight.
  const retarget = (): void => {
    if (flight?.effect instanceof KeyframeEffect) flight.effect.setKeyframes(keyframes());
  };

  try {
    container.append(card);
    flight = card.animate(keyframes(), { duration: FLIGHT_MS, easing: "cubic-bezier(0.32, 0, 0.12, 1)", fill: "forwards" });
    tint.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1 }], { duration: FLIGHT_MS, fill: "forwards" });
    window.addEventListener("resize", retarget);
    await flight.finished;
    // A breath between the landing and the toast, so they read as two steps.
    await new Promise((resolve) => setTimeout(resolve, LANDING_PAUSE_MS));
  } catch {
    // The animation is decoration; the copy has already happened either way.
  } finally {
    window.removeEventListener("resize", retarget);
    card.remove();
  }
}
