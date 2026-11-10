import { useEffect, useRef, type ReactNode } from "react";
import { startDepthReveal } from "./depthReveal";
import "./HeroDepthReveal.css";

/**
 * A WebGL canvas behind the hero's content that lets the cursor dig down
 * through the page background into a design layer (outlines, padding, rulers)
 * and, at its core, the hero's code. The real DOM always paints on top, and the
 * canvas never takes pointer events. Must be rendered as a direct child of the hero section.
 */
export function HeroDepthReveal(): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = canvas?.parentElement;
    if (!canvas || !root) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("hero-depth") === "0") return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Desktop only: needs a hovering mouse and room for the layers to read.
    const desktop = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 800px)");
    if (reducedMotion.matches || !desktop.matches) return;

    return startDepthReveal({ root, canvas });
  }, []);

  return <canvas className="landing-hero-depth" ref={canvasRef} aria-hidden="true" />;
}
