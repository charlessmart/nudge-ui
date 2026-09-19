import type { ReactNode } from "react";

/**
 * Historical hero snapshots used by the public canvas demo.
 *
 * Version 1 is based on 396fb8a, the first landing package commit. Version 2
 * is the centered hero from 8a9d44d.
 */
export type LandingVersion = "1" | "2";

function InstallCommand({ children }: { children: ReactNode }): ReactNode {
  return <div className="landing-version-command"><code>{children}</code></div>;
}

function FrameworkList(): ReactNode {
  return <span className="landing-version-frameworks">React, Next.js, HTML and Astro</span>;
}

const RULER_TICKS = Array.from({ length: 91 }, (_, index) => index * 20);

function Ruler({ orientation = "top" }: { orientation?: "top" | "left" }): ReactNode {
  const isVertical = orientation === "left";

  return (
    <div
      className={`landing-version-ruler landing-version-ruler--${orientation}`}
      data-test={isVertical ? "landing-version-ruler-left" : "landing-version-ruler"}
      aria-hidden="true"
    >
      <svg viewBox={isVertical ? "0 0 40 1800" : "0 0 1800 40"} preserveAspectRatio="none" focusable="false" fill="none">
        {isVertical ? (
          <line x1="0.5" y1="0" x2="0.5" y2="1800" stroke="var(--landing-version-ruler-line)" />
        ) : (
          <line x1="0" y1="0.5" x2="1800" y2="0.5" stroke="var(--landing-version-ruler-line)" />
        )}
        {RULER_TICKS.map((value) => {
          const height = value % 100 === 0 ? 22 : value % 40 === 0 ? 16 : 9;
          return (
            <line
              key={`tick-${value}`}
              x1={isVertical ? 1 : value}
              y1={isVertical ? value : 1}
              x2={isVertical ? height + 1 : value}
              y2={isVertical ? value : height + 1}
              stroke="var(--landing-version-ruler-line)"
              strokeWidth="1"
            />
          );
        })}
      </svg>
    </div>
  );
}

function RulerGrid(): ReactNode {
  return (
    <div className="landing-version-grid" data-test="landing-version-grid" aria-hidden="true">
      <svg viewBox="0 0 1800 1800" preserveAspectRatio="none" focusable="false" fill="none">
        {RULER_TICKS.map((value) => (
          <g key={`grid-line-${value}`}>
            <line x1={value} y1="0" x2={value} y2="1800" stroke="var(--border-tertiary)" strokeWidth="1" />
            <line x1="0" y1={value} x2="1800" y2={value} stroke="var(--border-tertiary)" strokeWidth="1" />
          </g>
        ))}
      </svg>
    </div>
  );
}

function VersionOneHero(): ReactNode {
  return (
    <section className="landing-version-hero landing-version-hero--v1 landing-inner" aria-labelledby="landing-version-title">
      <h1 id="landing-version-title">Nudge is for designing in code.</h1>
      <div className="landing-version-hero-side">
        <p className="landing-version-intro">
          Nudge works with your <FrameworkList /> code. Adjust styles, move elements, change text and adjust tokens directly. Then hand off to an agent.
        </p>
        <p className="landing-version-install-label">Ask your agent to install nudge-ui:</p>
        <InstallCommand>Let&apos;s install @nudge-ui/plugin in this project</InstallCommand>
      </div>
      <div className="landing-version-mockup" aria-hidden="true" />
    </section>
  );
}

function VersionTwoHero(): ReactNode {
  return (
    <div className="landing-version-v2">
      <Ruler />
      <Ruler orientation="left" />
      <RulerGrid />
      <section className="landing-version-hero landing-version-hero--v2 landing-inner" aria-labelledby="landing-version-title">
        <div className="landing-version-hero-copy">
          <h1 id="landing-version-title">Nudge is for designing in prod</h1>
          <div className="landing-version-hero-side">
            <p className="landing-version-intro">
              Nudge works with your <FrameworkList /> code. Adjust styles, move elements, change text and adjust tokens directly, then hand off to an agent.
            </p>
            <p className="landing-version-install-label">Ask your agent to install nudge-ui:</p>
            <InstallCommand>Let&apos;s install @nudge-ui/vite-react in this project</InstallCommand>
          </div>
        </div>
      </section>
    </div>
  );
}

export function LandingVersionPage({ version }: { version: LandingVersion }): ReactNode {
  return (
    <div className={`landing landing-version landing-version--${version}`} id="top">
      <main>
        {version === "1" ? <VersionOneHero /> : <VersionTwoHero />}
      </main>
    </div>
  );
}
