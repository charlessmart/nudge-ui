import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { IconArrowDown } from "@tabler/icons-react";
import {
  AstroMark,
  ChromeIcon,
  CopyIcon,
  DoneIcon,
  FrameworkName,
  HtmlMark,
  InstallCommand,
  NextMark,
  OPEN_NUDGE_EVENT,
  ReactMark,
  chromeStoreUrl,
  installPrompt,
} from "../App";
import {
  CanvasStage,
  CommentStage,
  SketchStage,
  SpacingStage,
  TextStage,
  TokenStage,
  useRevealOnce,
} from "../components/FeatureBento";
import { LandingButton } from "../components/LandingButton";
import "./layouts.css";

type GuideKind = "columns" | "ruler" | "margins" | "hlines" | "sparse";
type FeatureId = "text" | "tokens" | "spacing" | "comment" | "sketch" | "canvas";

type LayoutVariant = {
  slug: string;
  label: string;
  note: string;
  guides: GuideKind;
};

export const LAYOUT_VARIANTS: readonly LayoutVariant[] = [
  { slug: "centered", label: "Centered", note: "Centered hero, install strip, the original Rails bento. Column guides fade out through the gutters.", guides: "columns" },
  { slug: "split", label: "Split", note: "Title left, copy and install right. Even 3×2 bento with mono indices. A ruler runs down each rail.", guides: "ruler" },
  { slug: "sidebar", label: "Sidebar", note: "Hero lives in a sticky left rail while the bento scrolls past. Red measurement callouts in the margin.", guides: "margins" },
  { slug: "interlocked", label: "Interlocked", note: "The hero is a cell in the grid, text at its foot, white space above. Guide lines run the full width of the page.", guides: "hlines" },
  { slug: "blueprint", label: "Blueprint", note: "No cell borders. A 12-column offset bento held together by registration marks at the corners.", guides: "sparse" },
];

const FEATURES = {
  text: { title: "Edit text in place.", description: "Click any words on the page and retype them." },
  tokens: { title: "Use your tokens.", description: "Swap a color for one your project already defines." },
  spacing: { title: "Drag padding and gaps.", description: "Pull the spacing until it looks right." },
  comment: { title: "Leave a comment for your agent.", description: "Pin a note to the element it’s about." },
  sketch: { title: "Sketch an idea.", description: "Draw over the page when words won’t do." },
  canvas: { title: "Compare & iterate on a canvas.", description: "Lay versions side by side and pick one." },
} satisfies Record<FeatureId, { title: string; description: string }>;

const DEFAULT_ORDER: readonly FeatureId[] = ["text", "tokens", "spacing", "comment", "sketch", "canvas"];
const WIDE: ReadonlySet<FeatureId> = new Set(["text", "canvas"]);

/* ───────────────────────── guides ───────────────────────── */

const RULER_LABELS = Array.from({ length: 24 }, (_, index) => index * 160);

function Guides({ kind }: { kind: GuideKind }): ReactNode {
  return (
    <div className="lv-guides" data-kind={kind} aria-hidden="true">
      {(["left", "right"] as const).map((side) => (
        <div className={`lv-guides-side lv-guides-side--${side}`} key={side}>
          {kind === "columns" ? <span className="lv-guides-tag">120</span> : null}
          {kind === "ruler" ? RULER_LABELS.map((value) => (
            <span className="lv-guides-number" key={value} style={{ top: value }}>{value}</span>
          )) : null}
        </div>
      ))}
    </div>
  );
}

function Measure({ side, top, height, label }: { side: "left" | "right"; top: number; height: number; label: string }): ReactNode {
  return (
    <span className={`lv-measure lv-measure--${side}`} style={{ top, height }} aria-hidden="true">
      <span className="lv-measure-label">{label}</span>
    </span>
  );
}

function HLine({ top }: { top: number }): ReactNode {
  return <span className="lv-hline" style={{ top }} aria-hidden="true" />;
}

/* ───────────────────────── copy ───────────────────────── */

function Title(): ReactNode {
  return <h1 className="lv-title" id="lv-title">Nudge, a design panel for your codebase.</h1>;
}

function Intro(): ReactNode {
  return (
    <p className="lv-intro">
      Nudge works with your <FrameworkName icon={<ReactMark />}>React</FrameworkName>, <FrameworkName icon={<NextMark />}>Next.js</FrameworkName>, <FrameworkName icon={<HtmlMark />}>HTML</FrameworkName> and <FrameworkName icon={<AstroMark />}>Astro</FrameworkName> code. Adjust styles, move elements, change text and adjust tokens directly, then hand off to an agent.
    </p>
  );
}

function scrollToBento(): void {
  window.dispatchEvent(new Event(OPEN_NUDGE_EVENT));
  document.querySelector(".lv-bento")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function CopyPromptButton(): ReactNode {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(installPrompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <LandingButton type="button" variant="secondary" className="landing-install-copy" data-copied={copied} onClick={copy}>
      <span className="landing-install-copy-icon" aria-hidden="true">
        <CopyIcon />
        <DoneIcon />
      </span>
      {copied ? "Install prompt copied" : "Copy install prompt"}
    </LandingButton>
  );
}

function InstallStrip(): ReactNode {
  return (
    <div className="lv-strip">
      <div className="lv-strip-cell lv-strip-cell--try">
        <span className="lv-eyebrow">Try it first</span>
        <h2 className="lv-strip-title">Right here, on this page</h2>
        <p className="lv-strip-copy">Rewrite the copy, swap a token or drag the spacing below, and see it immediately. Nothing to install.</p>
        <LandingButton type="button" variant="primary" onClick={scrollToBento}>
          Try it yourself right here
          <IconArrowDown size={16} stroke={1.6} aria-hidden="true" />
        </LandingButton>
      </div>
      <div className="lv-strip-cell">
        <span className="lv-eyebrow">Install</span>
        <h2 className="lv-strip-title">Chrome extension</h2>
        <p className="lv-strip-copy">For quickly messing with production. Edit any page you have open, with no setup.</p>
        <LandingButton variant="secondary" href={chromeStoreUrl} target="_blank" rel="noreferrer">
          <ChromeIcon />
          Add to Chrome
        </LandingButton>
      </div>
      <div className="lv-strip-cell">
        <span className="lv-eyebrow">Install</span>
        <h2 className="lv-strip-title">npm package</h2>
        <p className="lv-strip-copy">For deeper work. Use your real components, share with collaborators, and iterate on the canvas with html mockups.</p>
        <CopyPromptButton />
      </div>
    </div>
  );
}

/* ───────────────────────── bento ───────────────────────── */

/** Scales a stage down, never up, when its cell is narrower than the illustration. */
function FitStage({ enabled, children }: { enabled: boolean; children: ReactNode }): ReactNode {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const outerElement = outer.current;
    const innerElement = inner.current;
    if (!enabled || !outerElement || !innerElement) return;

    const fit = () => {
      innerElement.style.zoom = "1";
      const natural = innerElement.offsetWidth;
      const available = outerElement.clientWidth;
      innerElement.style.zoom = natural > available && natural > 0 ? String(available / natural) : "1";
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(outerElement);
    return () => observer.disconnect();
  }, [enabled]);

  if (!enabled) return <div className="lv-fit lv-fit--fill">{children}</div>;

  return (
    <div className="lv-fit" ref={outer}>
      <div className="lv-fit-inner" ref={inner}>{children}</div>
    </div>
  );
}

function FeatureStage({ id, isVisible }: { id: FeatureId; isVisible: boolean }): ReactNode {
  switch (id) {
    case "text": return <TextStage />;
    case "tokens": return <TokenStage />;
    case "spacing": return <SpacingStage tiles={4} />;
    case "comment": return <CommentStage isVisible={isVisible} />;
    case "sketch": return <SketchStage />;
    case "canvas": return <CanvasStage />;
  }
}

function FeatureCell({ id, index, isVisible, className = "", label }: {
  id: FeatureId;
  index: number;
  isVisible: boolean;
  className?: string;
  label?: string;
}): ReactNode {
  const copy = FEATURES[id];
  return (
    <article
      className={`lv-cell lv-cell--${id}${WIDE.has(id) ? " lv-cell--wide" : ""}${className ? ` ${className}` : ""}`}
      // SAFETY: Custom property keys are absent from React's CSSProperties, so object literals carrying them require a cast.
      style={{ "--landing-bento-index": index } as CSSProperties}
    >
      {label ? <span className="lv-cell-label">{label}</span> : null}
      <div className="lv-cell-stage">
        <div className="landing-bento-stage">
          <FitStage enabled={id !== "spacing"}>
            <FeatureStage id={id} isVisible={isVisible} />
          </FitStage>
        </div>
      </div>
      <p className="lv-cell-caption"><strong>{copy.title}</strong> <span>{copy.description}</span></p>
    </article>
  );
}

function Bento({ variant, order = DEFAULT_ORDER, cellClass, indexed = false, children }: {
  variant: string;
  order?: readonly FeatureId[];
  cellClass?: (id: FeatureId) => string;
  indexed?: boolean;
  children?: ReactNode;
}): ReactNode {
  const { ref, isVisible } = useRevealOnce();

  return (
    <div className={`landing-bento lv-bento lv-bento--${variant}`} ref={ref} data-visible={isVisible}>
      {children}
      {order.map((id, index) => (
        <FeatureCell
          key={id}
          id={id}
          index={children ? index + 1 : index}
          isVisible={isVisible}
          className={cellClass?.(id)}
          label={indexed ? String(index + 1).padStart(2, "0") : undefined}
        />
      ))}
    </div>
  );
}

/* ───────────────────────── layouts ───────────────────────── */

function CenteredLayout(): ReactNode {
  return (
    <>
      <section className="lv-hero lv-hero--centered" aria-labelledby="lv-title">
        <Title />
        <Intro />
      </section>
      <InstallStrip />
      <Bento variant="classic" />
    </>
  );
}

function SplitLayout(): ReactNode {
  return (
    <>
      <section className="lv-hero lv-hero--split" aria-labelledby="lv-title">
        <Title />
        <div className="lv-hero-side">
          <Intro />
          <InstallCommand />
        </div>
      </section>
      <Bento variant="even" indexed />
    </>
  );
}

function SidebarLayout(): ReactNode {
  return (
    <div className="lv-sidebar-layout">
      <Measure side="left" top={0} height={128} label="128" />
      <Measure side="right" top={0} height={128} label="128" />
      <section className="lv-hero lv-hero--sidebar" aria-labelledby="lv-title">
        <div className="lv-hero-top">
          <Title />
          <Intro />
          <InstallCommand />
        </div>
        <a className="lv-hero-foot" href="https://github.com/charlessmart/nudge-ui" target="_blank" rel="noreferrer">github.com/charlessmart/nudge-ui</a>
      </section>
      <Bento variant="pair" />
    </div>
  );
}

function InterlockedLayout(): ReactNode {
  return (
    <>
      <HLine top={0} />
      <HLine top={381} />
      <HLine top={762} />
      <HLine top={1143} />
      <Bento variant="interlocked">
        <section className="lv-cell lv-cell--hero lv-cell--wide" aria-labelledby="lv-title">
          <span className="lv-wordmark"><i aria-hidden="true" />nudge-ui</span>
          <div className="lv-hero-top">
            <Title />
            <Intro />
            <InstallCommand />
          </div>
        </section>
      </Bento>
    </>
  );
}

const BLUEPRINT_ORDER: readonly FeatureId[] = ["text", "tokens", "spacing", "canvas", "comment", "sketch"];
const BLUEPRINT_SPAN = {
  text: "lv-span-7",
  tokens: "lv-span-5 lv-edge",
  spacing: "lv-span-5",
  canvas: "lv-span-7 lv-edge",
  comment: "lv-span-6",
  sketch: "lv-span-6 lv-edge",
} satisfies Record<FeatureId, string>;

function BlueprintLayout(): ReactNode {
  return (
    <>
      <section className="lv-hero lv-hero--blueprint" aria-labelledby="lv-title">
        <Title />
        <Intro />
        <InstallCommand />
      </section>
      <Bento variant="blueprint" order={BLUEPRINT_ORDER} cellClass={(id) => BLUEPRINT_SPAN[id]} />
    </>
  );
}

function VariantLayout({ slug }: { slug: string }): ReactNode {
  switch (slug) {
    case "centered": return <CenteredLayout />;
    case "split": return <SplitLayout />;
    case "sidebar": return <SidebarLayout />;
    case "interlocked": return <InterlockedLayout />;
    case "blueprint": return <BlueprintLayout />;
    default: return null;
  }
}

/* ───────────────────────── page chrome ───────────────────────── */

function VariantSwitcher({ current }: { current: string | null }): ReactNode {
  return (
    <nav className="lv-switcher" aria-label="Layout variants">
      <a href="/layouts" data-current={current === null || undefined}>All</a>
      {LAYOUT_VARIANTS.map((variant, index) => (
        <a key={variant.slug} href={`/layouts/${variant.slug}`} data-current={current === variant.slug || undefined} title={variant.label}>
          {index + 1}
        </a>
      ))}
    </nav>
  );
}

function VariantIndex(): ReactNode {
  return (
    <main className="lv-index">
      <h1 className="lv-index-title">Layouts</h1>
      <p className="lv-index-lead">Five hero + bento layouts on the Rails idea: hairline rails, a calm 30px hero, layout-guide lines in the margins.</p>
      <ol className="lv-index-list">
        {LAYOUT_VARIANTS.map((variant, index) => (
          <li key={variant.slug}>
            <a href={`/layouts/${variant.slug}`}>
              <span className="lv-index-number">{String(index + 1).padStart(2, "0")}</span>
              <span className="lv-index-name">{variant.label}</span>
              <span className="lv-index-note">{variant.note}</span>
            </a>
          </li>
        ))}
      </ol>
    </main>
  );
}

export function LayoutVariantsPage({ slug }: { slug: string | null }): ReactNode {
  const variant = LAYOUT_VARIANTS.find((candidate) => candidate.slug === slug) ?? null;

  return (
    <div className="landing lv" data-layout={variant?.slug}>
      {variant ? (
        <>
          <Guides kind={variant.guides} />
          <main className="lv-main">
            <div className="lv-frame">
              <VariantLayout slug={variant.slug} />
            </div>
          </main>
        </>
      ) : <VariantIndex />}
      <VariantSwitcher current={variant?.slug ?? null} />
    </div>
  );
}
