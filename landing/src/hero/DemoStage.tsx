import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { type CursorTarget, type Scene, type SelectableId, usePrefersReducedMotion, useScene } from "./demoScene";

const ELEMENT_LABELS: Record<SelectableId, string> = {
  card: "div.card",
  thread: "div.thread",
  chip: "span.chip",
  title: "h3.title",
  button: "button.cta",
};

const GAP_BAR_COUNT = 3;
const CURSOR_EASE_MS = 120;

function useStageActive(ref: RefObject<HTMLElement | null>): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (!("IntersectionObserver" in window)) {
      setActive(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setActive(entry.isIntersecting);
    }, { threshold: 0.25 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return active;
}

function useStageScale(ref: RefObject<HTMLElement | null>, designWidth: number, maxScale: number): number {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setScale(Math.min(maxScale, element.getBoundingClientRect().width / designWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, designWidth, maxScale]);

  return scale;
}

type StageProps = {
  /** Design-space size; the stage scales down to fit its container. */
  width: number;
  height: number;
  maxScale?: number;
  className?: string;
  children: (scene: Scene) => ReactNode;
};

/** Plays the scripted edit loop over `children` with a cursor, selection outline, padding and gap overlays. */
export function DemoStage({ width, height, maxScale = 1, className, children }: StageProps): ReactNode {
  const outerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<HTMLDivElement>(null);
  const selectionLabelRef = useRef<HTMLSpanElement>(null);
  const hoverRef = useRef<HTMLDivElement>(null);
  const gapBarRefs = useRef<Array<HTMLDivElement | null>>([]);

  const reducedMotion = usePrefersReducedMotion();
  const active = useStageActive(outerRef);
  const scale = useStageScale(outerRef, width, maxScale);
  const scene = useScene(active, reducedMotion);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reducedMotion || !active) return;

    const park = { x: width * 0.92, y: height + 40 };
    const cursor = { ...park };
    let last = performance.now();
    let frame = 0;

    const measure = (id: string, canvasRect: DOMRect, canvasScale: number) => {
      const element = canvas.querySelector<HTMLElement>(`[data-t="${id}"]`);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        x: (rect.left - canvasRect.left) / canvasScale,
        y: (rect.top - canvasRect.top) / canvasScale,
        width: rect.width / canvasScale,
        height: rect.height / canvasScale,
        element,
      };
    };

    const resolve = (target: CursorTarget | null, canvasRect: DOMRect, canvasScale: number) => {
      if (!target) return park;
      const box = measure(target.id, canvasRect, canvasScale);
      if (!box) return null;
      return {
        x: box.x + box.width * (target.fx ?? 0.5) + (target.dx ?? 0),
        y: box.y + box.height * (target.fy ?? 0.5) + (target.dy ?? 0),
      };
    };

    const place = (element: HTMLElement | null, box: { x: number; y: number; width: number; height: number } | null) => {
      if (!element) return;
      if (!box || box.width < 2 || box.height < 2) {
        element.dataset.visible = "false";
        return;
      }
      element.dataset.visible = "true";
      element.style.transform = `translate3d(${box.x}px, ${box.y}px, 0)`;
      element.style.width = `${box.width}px`;
      element.style.height = `${box.height}px`;
    };

    const tick = (now: number) => {
      const dt = Math.min(now - last, 64);
      last = now;
      const current = sceneRef.current;
      const canvasRect = canvas.getBoundingClientRect();
      const canvasScale = canvasRect.width / canvas.offsetWidth || 1;

      const destination = resolve(current.target, canvasRect, canvasScale);
      if (destination) {
        const blend = 1 - Math.exp(-dt / CURSOR_EASE_MS);
        cursor.x += (destination.x - cursor.x) * blend;
        cursor.y += (destination.y - cursor.y) * blend;
      }
      if (cursorRef.current) cursorRef.current.style.transform = `translate3d(${cursor.x}px, ${cursor.y}px, 0)`;

      const selected = current.selected ? measure(current.selected, canvasRect, canvasScale) : null;
      place(selectionRef.current, selected);
      if (selected && selectionRef.current && current.selected) {
        const padding = current.selected === "card" && current.field === "padding"
          ? Number.parseFloat(getComputedStyle(selected.element).paddingTop) || 0
          : 0;
        selectionRef.current.style.borderWidth = `${padding}px`;
        if (selectionLabelRef.current) selectionLabelRef.current.textContent = ELEMENT_LABELS[current.selected];
        selectionRef.current.dataset.padding = padding > 0 ? "true" : "false";
      }

      const hovered = current.hover && current.hover !== current.selected ? measure(current.hover, canvasRect, canvasScale) : null;
      place(hoverRef.current, hovered);

      const thread = current.selected === "thread" && current.field === "gap" ? canvas.querySelector<HTMLElement>('[data-t="thread"]') : null;
      for (let index = 0; index < GAP_BAR_COUNT; index += 1) {
        const bar = gapBarRefs.current[index];
        if (!bar) continue;
        const above = thread?.children[index];
        const below = thread?.children[index + 1];
        if (!above || !below) {
          bar.dataset.visible = "false";
          continue;
        }
        const aboveRect = above.getBoundingClientRect();
        const belowRect = below.getBoundingClientRect();
        place(bar, {
          x: (aboveRect.left - canvasRect.left) / canvasScale,
          y: (aboveRect.bottom - canvasRect.top) / canvasScale,
          width: aboveRect.width / canvasScale,
          height: (belowRect.top - aboveRect.bottom) / canvasScale,
        });
      }

      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, reducedMotion, width, height]);

  return (
    <div
      className={`hm-stage${className ? ` ${className}` : ""}`}
      ref={outerRef}
      // SAFETY: Custom property keys are absent from React's CSSProperties, so object literals carrying them require a cast.
      style={{ height: height * scale, "--hm-scale": scale } as CSSProperties}
      data-reduced-motion={reducedMotion || undefined}
    >
      <div
        className="hm-canvas"
        ref={canvasRef}
        style={{ width, height, transform: `scale(${scale})` }}
        aria-hidden="true"
      >
        {children(scene)}
        {reducedMotion ? null : (
          <>
            <div className="hm-overlay hm-overlay--hover" ref={hoverRef} data-visible="false" />
            {Array.from({ length: GAP_BAR_COUNT }, (_, index) => (
              <div
                className="hm-overlay hm-overlay--gap"
                key={index}
                ref={(element) => { gapBarRefs.current[index] = element; }}
                data-visible="false"
              />
            ))}
            <div className="hm-overlay hm-overlay--selection" ref={selectionRef} data-visible="false">
              <span className="hm-overlay-label" ref={selectionLabelRef} />
              <i className="hm-handle hm-handle--tl" />
              <i className="hm-handle hm-handle--tr" />
              <i className="hm-handle hm-handle--bl" />
              <i className="hm-handle hm-handle--br" />
            </div>
            <div className="hm-cursor" ref={cursorRef} data-pressed={scene.pressed}>
              <span className="hm-cursor-ring" />
              <svg viewBox="0 0 20 22" width="18" height="20" fill="none">
                <path d="M2.5 1.8 17 9.3l-6.1 1.9-2.6 6.2L2.5 1.8Z" fill="#1c1c1c" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
