import { studyArtifactId } from "./frameContent.ts";
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { setCanvasLayoutTransitioning, type CanvasCamera, type CanvasCard, type CanvasPresentation } from "./canvasStore.ts";

const SLIDE_OPTIONS: KeyframeAnimationOptions = { duration: 300, easing: "ease-out" };

/** Animates frame creation and layout changes without delaying direct manipulation. */
export function useCanvasLayoutAnimation(
  boardRef: RefObject<HTMLDivElement | null>,
  cards: readonly CanvasCard[],
  camera: CanvasCamera,
  presentation: CanvasPresentation,
): void {
  const previous = useRef({ cards, camera, presentation });
  const animations = useRef<Animation[]>([]);
  const generation = useRef(0);
  const groups = useRef(new Map<string, { left: string; top: string; width: string }>());

  useEffect(() => {
    const board = boardRef.current;
    const cancel = () => {
      generation.current += 1;
      setCanvasLayoutTransitioning(false);
      for (const animation of animations.current) animation.cancel();
      animations.current = [];
    };
    const cancelWheel = (event: WheelEvent) => {
      if (board && event.composedPath().includes(board)) cancel();
    };
    board?.addEventListener("pointerdown", cancel, true);
    window.addEventListener("wheel", cancelWheel, true);
    return () => {
      cancel();
      board?.removeEventListener("pointerdown", cancel, true);
      window.removeEventListener("wheel", cancelWheel, true);
    };
  }, [boardRef]);

  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = { cards, camera, presentation };
    const oldCards = new Map(before.cards.map((card) => [card.id, card]));
    const layoutChanged = cards.some((card) => {
      const old = oldCards.get(card.id);
      return (!old && card.animateEntrance !== false && (card.entrance === "linked" || studyArtifactId(card.content))) || (old && studyArtifactId(card.content) && studyArtifactId(old.content) !== studyArtifactId(card.content));
    });
    const shouldAnimate = layoutChanged && presentation === "canvas" && before.presentation === "canvas"
      && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const board = boardRef.current;
    const animate = (element: HTMLElement, frames: Keyframe[]) => {
      if (shouldAnimate && typeof element.animate === "function") {
        animations.current.push(element.animate(frames, SLIDE_OPTIONS));
      }
    };
    if (shouldAnimate) {
      generation.current += 1;
      setCanvasLayoutTransitioning(true);
      for (const animation of animations.current) animation.cancel();
      animations.current = [];
      for (const element of board?.querySelectorAll<HTMLElement>(".canvas-card") ?? []) {
        const card = cards.find((item) => item.id === element.dataset.cardId);
        if (!card) continue;
        const old = oldCards.get(card.id);
        if (!old) {
          if (card.animateEntrance === false) continue;
          const slideRight = Boolean(card.entrance === "linked");
          animate(element, [
            { left: `${card.x - (slideRight ? 200 : 0)}px`, top: `${card.y - (slideRight ? 0 : 200)}px`, opacity: 0 },
            { left: `${card.x}px`, top: `${card.y}px`, opacity: 1 },
          ]);
        } else if (old.x !== card.x || old.y !== card.y) {
          animate(element, [{ left: `${old.x}px`, top: `${old.y}px` }, { left: `${card.x}px`, top: `${card.y}px` }]);
        }
      }
      const content = board?.querySelector<HTMLElement>(".canvas-workspace__board-content");
      if (content) {
        const added = cards.find((card) => !oldCards.has(card.id));
        const slideRight = Boolean(added?.entrance === "linked");
        animate(content, [
          { transform: `translate(${added && !slideRight ? camera.x : before.camera.x}px, ${slideRight ? camera.y : before.camera.y}px) scale(${before.camera.zoom})` },
          { transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` },
        ]);
      }
    }
    const nextGroups = new Map<string, { left: string; top: string; width: string }>();
    for (const element of board?.querySelectorAll<HTMLElement>(".canvas-frame-section:not(.is-ungrouped)") ?? []) {
      const id = element.dataset.groupId!;
      const next = { left: element.style.left, top: element.style.top, width: element.style.width };
      const old = groups.current.get(id);
      if (old) animate(element, [old, next]);
      nextGroups.set(id, next);
    }
    groups.current = nextGroups;
    if (shouldAnimate) {
      const current = generation.current;
      void Promise.all(animations.current.map((animation) => animation.finished.catch(() => undefined))).then(() => {
        if (generation.current !== current) return;
        animations.current = [];
        setCanvasLayoutTransitioning(false);
      });
    } else if (presentation !== before.presentation) {
      generation.current += 1;
      for (const animation of animations.current) animation.cancel();
      animations.current = [];
      setCanvasLayoutTransitioning(false);
    }
  }, [boardRef, cards, camera, presentation]);
}
