import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { IconArrowUpRight, IconMessageCircle, IconPlayerPlay, IconSketching } from "@tabler/icons-react";
import { LandingButton } from "./LandingButton";
import "./FeatureBento.css";

const paletteTokens = ["--palette-blue", "--palette-amber", "--palette-green", "--palette-rose"] as const;

function PointerGlyph({ className }: { className: string }): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.8289 10.9379L14.499 12.9999L14.1844 13.1399C13.9474 13.2324 13.7322 13.373 13.5524 13.5529C13.3725 13.7327 13.2319 13.9479 13.1395 14.1849L10.9376 19.8288C10.3047 21.4538 7.97489 21.3668 7.46494 19.6988L3.08331 5.38099C2.65134 3.97101 3.97123 2.65202 5.38111 3.08302L19.6989 7.46496C21.3668 7.97595 21.4537 10.3039 19.8289 10.9379Z" />
    </svg>
  );
}

function useRevealOnce(): { ref: RefObject<HTMLDivElement | null>; isVisible: boolean } {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (!("IntersectionObserver" in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setIsVisible(true);
      observer.disconnect();
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

function BentoCard({
  area,
  index,
  title,
  children,
}: {
  area: string;
  index: number;
  title: string;
  children: ReactNode;
}): ReactNode {
  return (
    <article
      className={`landing-bento-card landing-bento-card--${area}`}
      // SAFETY: Custom property keys are absent from React's CSSProperties, so object literals carrying them require a cast.
      style={{ "--landing-bento-index": index } as CSSProperties}
    >
      <div className="landing-bento-stage">{children}</div>
      <div className="landing-bento-copy">
        <h3 className="landing-bento-title">{title}</h3>
      </div>
    </article>
  );
}

function TextStage(): ReactNode {
  return (
    <div className="landing-bento-text">
      <div className="landing-bento-text-target">
        <span className="landing-bento-text-tag" aria-hidden="true">Heading</span>
        <h4 className="landing-bento-text-heading">Try it out</h4>
        <PointerGlyph className="landing-bento-text-pointer" />
      </div>
      <p className="landing-bento-text-body">Last copy tweak, I promise</p>
    </div>
  );
}

function TokenStage(): ReactNode {
  return (
    <div className="landing-bento-tokens">
      <LandingButton type="button" variant="primary">
        Try it out
        <IconArrowUpRight className="landing-button-icon" stroke={2} aria-hidden="true" />
      </LandingButton>
      <ul className="landing-bento-token-menu" aria-label="Color tokens">
        {paletteTokens.map((token) => (
          <li className="landing-bento-token" key={token}>
            <span
              className="landing-bento-token-swatch"
              // SAFETY: Custom property keys are absent from React's CSSProperties, so object literals carrying them require a cast.
              style={{ "--landing-bento-swatch": `var(${token})` } as CSSProperties}
            />
            <span>{token}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SpacingStage(): ReactNode {
  return (
    <div className="landing-bento-layout">
      {Array.from({ length: 8 }, (_, index) => (
        <div className="landing-bento-layout-tile" key={index}>
          <span className="landing-bento-layout-avatar" />
          <span className="landing-bento-layout-line" />
          <span className="landing-bento-layout-line landing-bento-layout-line--short" />
        </div>
      ))}
    </div>
  );
}

const commentNote = "Split into two columns";
// Matches the bubble's CSS reveal: card delay (index 3) plus 1300ms.
const commentTypingDelayMs = 3 * 80 + 360 + 1300;
const commentTypingStepMs = 45;

function useTypedText(text: string, isActive: boolean): string {
  const [length, setLength] = useState(0);

  useEffect(() => {
    if (!isActive) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLength(text.length);
      return;
    }

    let interval = 0;
    const timeout = window.setTimeout(() => {
      interval = window.setInterval(() => {
        setLength((current) => {
          if (current + 1 >= text.length) window.clearInterval(interval);
          return Math.min(current + 1, text.length);
        });
      }, commentTypingStepMs);
    }, commentTypingDelayMs);

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [isActive, text]);

  return text.slice(0, length);
}

function CommentCursor(): ReactNode {
  return (
    <svg className="landing-bento-comment-cursor" viewBox="0 0 24 24" fill="none">
      <path d="M4.3 16.1L3 20L7.7 19C11.659 20.922 16.608 19.942 19.274 16.707C21.94 13.472 21.5 8.983 18.245 6.206C14.99 3.43 9.926 3.225 6.4 5.726C2.874 8.228 1.976 12.663 4.3 16.1Z" />
    </svg>
  );
}

function CommentStage({ isVisible }: { isVisible: boolean }): ReactNode {
  const typed = useTypedText(commentNote, isVisible);
  const isTyping = typed.length < commentNote.length;

  return (
    <div className="landing-bento-comment" aria-hidden="true">
      <div className="landing-bento-wire landing-bento-comment-card">
        <span className="landing-bento-wire-line" style={{ width: "64%" }} />
        <span className="landing-bento-wire-line" style={{ width: "42%" }} />
        <span className="landing-bento-comment-target">
          <span className="landing-bento-wire landing-bento-comment-button" />
          <CommentCursor />
          <span className="landing-bento-comment-bubble">
            <span className="landing-bento-comment-sizer">{commentNote}</span>
            <span className="landing-bento-comment-typed">
              {typed}
              <span className="landing-bento-comment-caret" data-typing={isTyping} />
            </span>
          </span>
        </span>
      </div>
    </div>
  );
}

function SketchStage(): ReactNode {
  return (
    <div className="landing-bento-sketch" aria-hidden="true">
      <div className="landing-bento-wire landing-bento-sketch-page">
        <span className="landing-bento-wire landing-bento-sketch-logo" />
        <span className="landing-bento-wire-line landing-bento-sketch-nav" />
        <span className="landing-bento-wire-line landing-bento-sketch-nav landing-bento-sketch-nav--end" />
        <span className="landing-bento-wire landing-bento-sketch-image" />
        <span className="landing-bento-wire-line landing-bento-sketch-copy" />
        <span className="landing-bento-wire-line landing-bento-sketch-copy landing-bento-sketch-copy--short" />
        <span className="landing-bento-wire landing-bento-sketch-button" />
        <svg className="landing-bento-sketch-strokes" viewBox="0 0 220 150" fill="none">
          <path pathLength={1} d="M150 98C152 86 206 82 214 100C222 120 196 132 176 131C154 130 138 120 146 104" />
          <path pathLength={1} d="M78 142C98 140 116 134 132 122" />
          <path pathLength={1} d="M120 120L133 121L129 133" />
        </svg>
      </div>
    </div>
  );
}

function ToolbarIllustration(): ReactNode {
  return (
    <div className="landing-bento-canvas-toolbar">
      <span className="landing-bento-canvas-tool" data-active="true"><PointerGlyph className="landing-bento-canvas-tool-pointer" /></span>
      <span className="landing-bento-canvas-tool"><IconMessageCircle size={16} stroke={1.5} /></span>
      <span className="landing-bento-canvas-tool"><IconSketching size={16} stroke={1.5} /></span>
      <span className="landing-bento-canvas-divider" />
      <span className="landing-bento-canvas-tool"><IconPlayerPlay size={16} stroke={1.5} /></span>
    </div>
  );
}

function CanvasFrame({ label, variant, selected = false }: { label: string; variant: "left" | "center" | "grid"; selected?: boolean }): ReactNode {
  return (
    <div className="landing-bento-canvas-card" data-selected={selected}>
      <span className="landing-bento-canvas-label">{label}</span>
      <div className={`landing-bento-wire landing-bento-canvas-frame landing-bento-canvas-frame--${variant}`}>
        <span className="landing-bento-wire-line landing-bento-canvas-title" />
        <span className="landing-bento-wire-line landing-bento-canvas-subtitle" />
        <span className="landing-bento-canvas-blocks">
          <span className="landing-bento-wire" />
          <span className="landing-bento-wire" />
          {variant === "grid" ? <span className="landing-bento-wire" /> : null}
        </span>
      </div>
    </div>
  );
}

function CanvasStage(): ReactNode {
  return (
    <div className="landing-bento-canvas" aria-hidden="true">
      <div className="landing-bento-canvas-frames">
        <CanvasFrame label="V1" variant="left" />
        <CanvasFrame label="V2" variant="center" />
        <CanvasFrame label="Final" variant="grid" selected />
      </div>
      <ToolbarIllustration />
    </div>
  );
}

export function FeatureBento(): ReactNode {
  const { ref, isVisible } = useRevealOnce();

  return (
    <div className="landing-bento" ref={ref} data-visible={isVisible}>
      <BentoCard area="text" index={0} title="Edit text in place">
        <TextStage />
      </BentoCard>
      <BentoCard area="tokens" index={1} title="Use your tokens">
        <TokenStage />
      </BentoCard>
      <BentoCard area="spacing" index={2} title="Drag padding and gaps">
        <SpacingStage />
      </BentoCard>
      <BentoCard area="comment" index={3} title="Comment, then hand off">
        <CommentStage isVisible={isVisible} />
      </BentoCard>
      <BentoCard area="sketch" index={4} title="Sketch an idea">
        <SketchStage />
      </BentoCard>
      <BentoCard area="canvas" index={5} title="Compare & iterate on a canvas">
        <CanvasStage />
      </BentoCard>
    </div>
  );
}
