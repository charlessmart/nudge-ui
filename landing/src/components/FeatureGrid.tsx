import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconFocusCentered,
  IconMessageCircle,
  IconPlayerPlay,
  IconSearch,
  IconSketching,
} from "@tabler/icons-react";
import { useRevealOnce } from "./FeatureBento";
import "./FeatureGrid.css";

// Each illustration is a slice of Nudge's own interface drawn in HTML: page surfaces in white, the inspector's
// controls in its greys, Nudge's selection blue for what is selected and its brand red for the one action in play.
// They are real elements rather than images, so the editor demo can select and edit them like the rest of the page.

function PointerGlyph({ className }: { className: string }): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.8289 10.9379L14.499 12.9999L14.1844 13.1399C13.9474 13.2324 13.7322 13.373 13.5524 13.5529C13.3725 13.7327 13.2319 13.9479 13.1395 14.1849L10.9376 19.8288C10.3047 21.4538 7.97489 21.3668 7.46494 19.6988L3.08331 5.38099C2.65134 3.97101 3.97123 2.65202 5.38111 3.08302L19.6989 7.46496C21.3668 7.97595 21.4537 10.3039 19.8289 10.9379Z" />
    </svg>
  );
}

function Lines({ widths }: { widths: readonly string[] }): ReactNode {
  return (
    <>
      {widths.map((width, index) => <span className="fg-line" key={index} style={{ width }} />)}
    </>
  );
}

/** The element's tag and size, centred below it as Nudge labels a selection. */
function SizeLabel({ children }: { children: ReactNode }): ReactNode {
  return <span className="fg-size-label" aria-hidden="true">{children}</span>;
}

function TextArt(): ReactNode {
  return (
    <div className="fg-art fg-art--text">
      <div className="fg-page">
        <span className="fg-page-nav" aria-hidden="true"><Lines widths={["18%", "12%", "12%"]} /></span>
        <div className="fg-text-target">
          <h4 className="landing-bento-text-heading">Try it out</h4>
          <span className="fg-caret" aria-hidden="true" />
          <SizeLabel>h4 · 132 × 30</SizeLabel>
        </div>
        <p className="fg-text-body">Last copy tweak, I promise</p>
        <span className="fg-page-lines" aria-hidden="true"><Lines widths={["86%", "72%", "40%"]} /></span>
      </div>
    </div>
  );
}

const tokens = [
  { name: "--brand-red", color: "#ff2600" },
  { name: "--palette-blue", color: "#2563eb" },
  { name: "--palette-amber", color: "#e9a800" },
  { name: "--palette-green", color: "#16a34a" },
] as const;

function TokensArt(): ReactNode {
  return (
    <div className="fg-art fg-art--tokens" aria-hidden="true">
      <div className="fg-panel fg-tokens-panel">
        <span className="fg-panel-heading">Background</span>
        <span className="fg-field">
          <span className="fg-swatch" style={{ "--fg-swatch": tokens[0].color } as CSSProperties} />
          {tokens[0].name}
          <IconChevronDown className="fg-field-chevron" size={12} stroke={1.75} />
        </span>
        <div className="fg-popover">
          <span className="fg-popover-search"><IconSearch size={11} stroke={1.75} />Search tokens</span>
          {tokens.map((token, index) => (
            <span className="fg-token" data-active={index === 0} key={token.name}>
              <span className="fg-swatch" style={{ "--fg-swatch": token.color } as CSSProperties} />
              {token.name}
              {index === 0 ? <IconCheck className="fg-token-check" size={12} stroke={2} /> : null}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SpacingArt(): ReactNode {
  return (
    <div className="fg-art fg-art--spacing" aria-hidden="true">
      <div className="fg-page fg-spacing-page">
        <div className="fg-spacing-card">
          {/* The padding band the cursor drags: Nudge fills spacing with a soft wash of its selection blue. */}
          <span className="fg-spacing-band" />
          <div className="fg-spacing-row">
            <span className="fg-avatar" />
            <span className="fg-spacing-copy"><Lines widths={["70%", "46%"]} /></span>
          </div>
          <span className="fg-spacing-gap" />
          <div className="fg-spacing-row">
            <span className="fg-avatar" />
            <span className="fg-spacing-copy"><Lines widths={["62%", "38%"]} /></span>
          </div>
          <span className="fg-spacing-handle">
            <span className="fg-spacing-value">padding 24</span>
          </span>
          <SizeLabel>div · 196 × 148</SizeLabel>
        </div>
      </div>
    </div>
  );
}

const commentNote = "Split into two columns";
const commentTypingStepMs = 45;
// Starts once the grid has faded in and the bubble has opened.
const commentTypingDelayMs = 1500;

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

function CommentArt({ isVisible }: { isVisible: boolean }): ReactNode {
  const typed = useTypedText(commentNote, isVisible);

  return (
    <div className="fg-art fg-art--comment" aria-hidden="true">
      <div className="fg-page fg-comment-page">
        <Lines widths={["54%", "36%"]} />
        <div className="fg-comment-target">
          <span className="fg-block" />
          <span className="fg-comment-pin"><IconMessageCircle size={12} stroke={2} /></span>
        </div>
      </div>
      <div className="fg-comment-bubble">
        <span className="fg-comment-avatar">C</span>
        <span className="fg-comment-input">
          <span className="fg-comment-sizer">{commentNote}</span>
          <span className="fg-comment-typed">
            {typed}
            <span className="fg-comment-caret" data-typing={typed.length < commentNote.length} />
          </span>
        </span>
        <span className="fg-comment-send"><IconArrowUp size={11} stroke={2.25} /></span>
      </div>
    </div>
  );
}

function SketchArt(): ReactNode {
  return (
    <div className="fg-art fg-art--sketch" aria-hidden="true">
      <div className="fg-page fg-sketch-page">
        <span className="fg-sketch-nav"><span className="fg-sketch-logo" /><Lines widths={["14%", "14%", "14%"]} /></span>
        <span className="fg-block fg-sketch-image" />
        <Lines widths={["64%", "44%"]} />
        <span className="fg-sketch-button" />
        <svg className="fg-sketch-strokes" viewBox="0 0 220 170" fill="none">
          <path pathLength={1} d="M24 140C22 126 70 122 86 134C100 146 76 158 52 157C32 156 18 150 26 138" />
          <path pathLength={1} d="M98 146C122 146 146 136 160 118" />
          <path pathLength={1} d="M150 116L161 117L158 128" />
        </svg>
        <span className="fg-sketch-note fg-hand">bigger?</span>
      </div>
      <div className="fg-sketch-tools">
        <span className="fg-sketch-tool" data-active="true"><IconSketching size={13} stroke={1.75} /></span>
        <span className="fg-sketch-color" style={{ "--fg-swatch": "#ff2600" } as CSSProperties} data-active="true" />
        <span className="fg-sketch-color" style={{ "--fg-swatch": "#242424" } as CSSProperties} />
        <span className="fg-sketch-color" style={{ "--fg-swatch": "#0086e6" } as CSSProperties} />
      </div>
    </div>
  );
}

function CanvasFrame({ label, layout, selected = false }: { label: string; layout: "split" | "stack" | "grid"; selected?: boolean }): ReactNode {
  return (
    <div className="fg-canvas-card" data-selected={selected}>
      <span className="fg-canvas-label">{label}</span>
      <div className={`fg-canvas-frame fg-canvas-frame--${layout}`}>
        <Lines widths={["62%", "38%"]} />
        <span className="fg-canvas-blocks">
          <span className="fg-block" />
          <span className="fg-block" />
          {layout === "grid" ? <span className="fg-block" /> : null}
        </span>
      </div>
    </div>
  );
}

function CanvasArt(): ReactNode {
  return (
    <div className="fg-art fg-art--canvas" aria-hidden="true">
      <div className="fg-canvas-frames">
        <CanvasFrame label="V1" layout="stack" />
        <CanvasFrame label="V2" layout="split" />
        <CanvasFrame label="Final" layout="grid" selected />
      </div>
      <div className="fg-toolbar">
        <span className="fg-tool" data-active="true"><PointerGlyph className="fg-tool-pointer" /></span>
        <span className="fg-tool"><IconMessageCircle size={13} stroke={1.6} /></span>
        <span className="fg-tool"><IconSketching size={13} stroke={1.6} /></span>
        <span className="fg-tool"><IconFocusCentered size={13} stroke={1.6} /></span>
        <span className="fg-toolbar-divider" />
        <span className="fg-tool"><IconPlayerPlay size={13} stroke={1.6} /></span>
        <span className="fg-toolbar-zoom">100%</span>
      </div>
    </div>
  );
}

const features: ReadonlyArray<{ id: string; title: string; art: (isVisible: boolean) => ReactNode }> = [
  {
    id: "text",
    title: "Edit text in place",
    art: () => <TextArt />,
  },
  {
    id: "tokens",
    title: "Use your tokens",
    art: () => <TokensArt />,
  },
  {
    id: "spacing",
    title: "Drag padding and gaps",
    art: () => <SpacingArt />,
  },
  {
    id: "comment",
    title: "Leave a comment for your agent",
    art: (isVisible) => <CommentArt isVisible={isVisible} />,
  },
  {
    id: "sketch",
    title: "Sketch an idea",
    art: () => <SketchArt />,
  },
  {
    id: "canvas",
    title: "Compare & iterate on a canvas",
    art: () => <CanvasArt />,
  },
];

export function FeatureGrid(): ReactNode {
  const { ref, isVisible } = useRevealOnce();

  return (
    <div className="fg" ref={ref} data-visible={isVisible}>
      {features.map(({ id, title, art }, index) => (
        <article
          className={`fg-item fg-item--${id}`}
          key={id}
          // SAFETY: Custom property keys are absent from React's CSSProperties, so object literals carrying them require a cast.
          style={{ "--fg-index": index } as CSSProperties}
        >
          {art(isVisible)}
          <h3 className="fg-title">{title}</h3>
        </article>
      ))}
    </div>
  );
}
