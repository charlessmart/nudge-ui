/** Plays the shared `.shake` animation on `element`, restarting it if it is already running. */
export function shake(element: HTMLElement): void {
  element.classList.remove("shake");
  // Reading a layout property flushes the removal so re-adding the class restarts the animation.
  void element.offsetWidth;
  element.classList.add("shake");
  element.addEventListener("animationend", () => element.classList.remove("shake"), { once: true });
}
