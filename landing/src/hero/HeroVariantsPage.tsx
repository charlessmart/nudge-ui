import type { ReactNode } from "react";
import { AstroMark, FrameworkName, HtmlMark, InstallCommand, NextMark, ReactMark } from "../App";
import { FullMock } from "./FullMock";
import { NarrowMock } from "./NarrowMock";
import "./hero.css";

type Variant = {
  slug: string;
  label: string;
  note: string;
  mock: "narrow" | "full";
};

export const HERO_VARIANTS: readonly Variant[] = [
  { slug: "narrow-split", label: "Narrow · Split", note: "Left-aligned copy, narrow chat edit on the right.", mock: "narrow" },
  { slug: "narrow-stage", label: "Narrow · Stage", note: "Chat sits on a brand-tinted grid stage that bleeds off the right edge.", mock: "narrow" },
  { slug: "narrow-stacked", label: "Narrow · Stacked", note: "Centered copy, chat peeking up from below with floating edit tags.", mock: "narrow" },
  { slug: "full-below", label: "Full · Below", note: "Existing copy position, full Nudge mock-up underneath.", mock: "full" },
  { slug: "full-bleed", label: "Full · Bleed", note: "Left-aligned copy, oversized mock-up cropped into the fold.", mock: "full" },
  { slug: "full-framed", label: "Full · Framed", note: "Centered copy, mock-up set inside a brand-washed frame.", mock: "full" },
];

function HeroCopy({ size = "default" }: { size?: "default" | "large" }): ReactNode {
  return (
    <div className="hv-copy" data-size={size}>
      <h1 className="hv-title">
        Nudge, a <span className="hv-pop">design panel</span> for your codebase.
      </h1>
      <p className="hv-intro">
        Nudge works with your <FrameworkName icon={<ReactMark />}>React</FrameworkName>, <FrameworkName icon={<NextMark />}>Next.js</FrameworkName>, <FrameworkName icon={<HtmlMark />}>HTML</FrameworkName> and <FrameworkName icon={<AstroMark />}>Astro</FrameworkName> code. Adjust styles, move elements, change text and adjust tokens directly, then hand off to an agent.
      </p>
      <InstallCommand />
    </div>
  );
}

function FloatingTag({ className, children }: { className: string; children: ReactNode }): ReactNode {
  return <span className={`hv-tag ${className}`} aria-hidden="true">{children}</span>;
}

function VariantLayout({ slug }: { slug: string }): ReactNode {
  switch (slug) {
    case "narrow-split":
      return (
        <section className="hv-hero hv-hero--split" aria-labelledby="hv-title">
          <HeroCopy size="large" />
          <div className="hv-mock hv-mock--narrow"><NarrowMock /></div>
        </section>
      );
    case "narrow-stage":
      return (
        <section className="hv-hero hv-hero--stage" aria-labelledby="hv-title">
          <HeroCopy size="large" />
          <div className="hv-stage-panel">
            <div className="hv-mock hv-mock--narrow"><NarrowMock /></div>
          </div>
        </section>
      );
    case "narrow-stacked":
      return (
        <section className="hv-hero hv-hero--stacked" aria-labelledby="hv-title">
          <HeroCopy />
          <div className="hv-peek">
            <FloatingTag className="hv-tag--left-top">padding 12 → 16</FloatingTag>
            <FloatingTag className="hv-tag--left-bottom">delete elements</FloatingTag>
            <FloatingTag className="hv-tag--right-top">edit text in place</FloatingTag>
            <FloatingTag className="hv-tag--right-bottom">gap 10 → 14</FloatingTag>
            <div className="hv-mock hv-mock--narrow"><NarrowMock /></div>
          </div>
        </section>
      );
    case "full-below":
      return (
        <section className="hv-hero hv-hero--below" aria-labelledby="hv-title">
          <HeroCopy />
          <div className="hv-mock hv-mock--full"><FullMock /></div>
        </section>
      );
    case "full-bleed":
      return (
        <section className="hv-hero hv-hero--bleed" aria-labelledby="hv-title">
          <HeroCopy size="large" />
          <div className="hv-bleed-wash" aria-hidden="true" />
          <div className="hv-mock hv-mock--full"><FullMock /></div>
        </section>
      );
    case "full-framed":
      return (
        <section className="hv-hero hv-hero--framed" aria-labelledby="hv-title">
          <HeroCopy />
          <div className="hv-frame">
            <div className="hv-mock hv-mock--full"><FullMock /></div>
          </div>
        </section>
      );
    default:
      return null;
  }
}

function VariantSwitcher({ current }: { current: string | null }): ReactNode {
  return (
    <nav className="hv-switcher" aria-label="Hero variants">
      <a href="/hero" data-current={current === null || undefined}>All</a>
      {HERO_VARIANTS.map((variant, index) => (
        <a key={variant.slug} href={`/hero/${variant.slug}`} data-current={current === variant.slug || undefined} title={variant.label}>
          {variant.mock === "narrow" ? "N" : "F"}{(index % 3) + 1}
        </a>
      ))}
    </nav>
  );
}

function VariantIndex(): ReactNode {
  return (
    <main className="hv-index">
      <h1 className="hv-index-title">Hero variants</h1>
      <p className="hv-index-lead">Six takes on the hero. Narrow runs a compact chat edit; Full runs a faithful Nudge window.</p>
      <ul className="hv-index-list">
        {HERO_VARIANTS.map((variant) => (
          <li key={variant.slug}>
            <a href={`/hero/${variant.slug}`}>
              <span className="hv-index-name">{variant.label}</span>
              <span className="hv-index-note">{variant.note}</span>
              <span className="hv-index-path">/hero/{variant.slug}</span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}

export function HeroVariantsPage({ slug }: { slug: string | null }): ReactNode {
  const variant = HERO_VARIANTS.find((candidate) => candidate.slug === slug) ?? null;

  return (
    <div className="landing hv">
      {variant ? <main className="hv-main"><VariantLayout slug={variant.slug} /></main> : <VariantIndex />}
      <VariantSwitcher current={variant?.slug ?? null} />
    </div>
  );
}
