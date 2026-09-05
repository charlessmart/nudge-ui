import type { ReactNode } from "react";

const installCommand = "@nudge-ui/vite-react in this project";

function CopyIcon(): ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="13" height="13" x="9" y="9" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function InstallCommand(): ReactNode {
  return (
    <div className="landing-install">
      <span className="landing-install-command">Let&apos;s install {installCommand}</span>
      <span className="landing-install-copy" aria-hidden="true">
        Copy
        <CopyIcon />
      </span>
    </div>
  );
}

function LiveDemo(): ReactNode {
  return (
    <section className="landing-demo landing-inner" id="demo">
      <div className="landing-demo-frame">
        <div className="landing-demo-frame-bar">
          <span className="landing-demo-frame-dots" aria-hidden="true"><i /><i /><i /></span>
          <span>nudge-ui-demo / demo?nudgeDemo=1</span>
          <span className="landing-demo-frame-status">LIVE INSPECTOR</span>
        </div>
        <iframe
          title="Nudge UI live inspector demo"
          src="/demo?nudgeDemo=1"
          loading="lazy"
        />
      </div>
    </section>
  );
}

export function App(): ReactNode {
  return (
    <div className="landing" id="top">
      <header className="landing-nav landing-inner">
        <a className="landing-brand" href="#top" aria-label="Nudge UI home"><span className="landing-logo" aria-hidden="true"><span className="landing-logo-mark" /></span>Nudge UI</a>
        <nav className="landing-nav-links" aria-label="Main navigation"><a href="https://github.com" target="_blank" rel="noreferrer">GitHub</a></nav>
      </header>

      <main>
        <section className="landing-hero landing-inner" aria-labelledby="landing-hero-title">
          <h1 id="landing-hero-title">Design where code&nbsp;lives.</h1>
          <div className="landing-hero-side">
            <p className="landing-hero-intro">A design panel for your React, Next and HTML code. Adjust styles, move elements, change text and adjust tokens directly. Then hand off to an agent.</p>
            <p className="landing-install-label">Ask your agent to install nudge-ui:</p>
            <InstallCommand />
          </div>
        </section>

        <LiveDemo />

        <section className="landing-features landing-inner" aria-labelledby="landing-features-title">
          <h2 id="landing-features-title">Made for design engineers.</h2>
          <div className="landing-feature-columns">
            <article className="landing-feature"><span className="landing-feature-index">01</span><h3>Tweak designs directly in your codebase</h3><p>Point the inspector at any element. Edits land as managed CSS rules and component props in your source files — no inline styles, no drift.</p></article>
            <span className="landing-vrule" aria-hidden="true" />
            <article className="landing-feature"><span className="landing-feature-index">02</span><h3>See the exact surface you are editing</h3><p>Select and experiment live in the browser. Every change renders where your components actually run, then becomes a focused instruction.</p></article>
            <span className="landing-vrule" aria-hidden="true" />
            <article className="landing-feature"><span className="landing-feature-index">03</span><h3>Components, tokens and styles supported</h3><p>Semantic props rerender through your framework adapter. Design tokens, typography and shared styles stay consistent across the whole project.</p></article>
          </div>
        </section>
      </main>

      <footer className="landing-footer"><div className="landing-footer-content landing-inner"><span>Nudge UI — dev-only by design</span><span className="landing-footer-meta">data-cid · managed css · zero prod footprint</span></div></footer>
    </div>
  );
}
