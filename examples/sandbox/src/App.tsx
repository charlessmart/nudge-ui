import type { ReactNode } from "react";

const installCommand = "@nudge-ui/plugin in this project";

function CopyIcon(): ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="13" height="13" x="9" y="9" rx="2" ry="2" />
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

/** Static replica of the inspector panel shown inside the product window mockup. */
function MockInspector() {
  return (
    <aside className="lw-inspector" aria-label="Inspector preview">
      <div className="lwi-header">
        <strong>Inspector</strong>
        <span className="lwi-file-chip">Card.tsx</span>
      </div>
      <div className="lwi-section">
        <span className="lwi-section-label">Layout</span>
        <div className="lwi-row">
          <span className="lwi-label">Size</span>
          <span className="lwi-values"><span className="lwi-input">W 320</span><span className="lwi-input">H 148</span></span>
        </div>
        <div className="lwi-row">
          <span className="lwi-label">Gap</span>
          <span className="lwi-values"><span className="lwi-input">12</span></span>
        </div>
        <div className="lwi-row">
          <span className="lwi-label">Radius</span>
          <span className="lwi-values"><span className="lwi-input">12</span></span>
        </div>
      </div>
      <div className="lwi-section">
        <span className="lwi-section-label">Fill</span>
        <div className="lwi-row">
          <span className="lwi-label">Fill</span>
          <span className="lwi-values"><i className="lwi-swatch" /><span className="lwi-input">#3F3F46</span></span>
        </div>
        <div className="lwi-row">
          <span className="lwi-label">Border</span>
          <span className="lwi-values"><span className="lwi-input">1px #E4E4E7</span></span>
        </div>
      </div>
      <div className="lwi-section">
        <span className="lwi-section-label">Typography</span>
        <div className="lwi-row">
          <span className="lwi-label">Font</span>
          <span className="lwi-values"><span className="lwi-input">Test Söhne</span></span>
        </div>
        <div className="lwi-row">
          <span className="lwi-label">Weight</span>
          <span className="lwi-values"><span className="lwi-input">500</span></span>
        </div>
        <div className="lwi-row">
          <span className="lwi-label">Size</span>
          <span className="lwi-values"><span className="lwi-input">14</span></span>
        </div>
      </div>
      <button className="lwi-prompt-btn" type="button">Copy prompt for agent</button>
    </aside>
  );
}

export function App() {
  return (
    <div className="landing" id="top">
      <header className="landing-nav landing-inner">
        <a className="landing-brand" href="#top" aria-label="Nudge UI home">
          <span className="landing-logo" aria-hidden="true"><span className="landing-logo-mark" /></span>
          Nudge UI
        </a>
        <nav className="landing-nav-links" aria-label="Main navigation">
          <a href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </header>

      <main>
        <section className="landing-hero landing-inner" aria-labelledby="landing-hero-title">
          <h1 id="landing-hero-title">Design where code&nbsp;lives.</h1>
          <div className="landing-hero-side">
            <p className="landing-hero-intro">
              A design panel for your React, Next and HTML code. Adjust styles,
              move elements, change text and adjust tokens directly. Then hand
              off to an agent.
            </p>
            <p className="landing-install-label">Ask your agent to install nudge-ui:</p>
            <InstallCommand />
          </div>
        </section>

        <section className="landing-window-wrap landing-inner" aria-label="A preview of the Nudge UI inspector">
          <div className="landing-window">
            <div className="lw-titlebar">
              <span className="lw-dots" aria-hidden="true"><i /><i /><i /></span>
              <span className="lw-url">localhost:5173/sandbox</span>
              <span className="lw-kbd" aria-hidden="true">⌘I</span>
            </div>
            <div className="lw-body">
              <div className="lw-canvas">
                <div className="lw-stage">
                  <div className="lw-card" aria-hidden="true">
                    <div className="lw-card-head">
                      <span className="lw-avatar" />
                      <span className="lw-card-lines"><i className="lw-line-strong" /><i className="lw-line-soft" /></span>
                    </div>
                    <span className="lw-line lw-line-soft" />
                    <span className="lw-line lw-line-soft short" />
                  </div>
                  <div className="lw-selection" aria-hidden="true">
                    <i className="lw-handle tl" /><i className="lw-handle tr" />
                    <i className="lw-handle bl" /><i className="lw-handle br" />
                  </div>
                  <span className="lw-sizechip">360 × 148</span>
                </div>
              </div>
              <MockInspector />
            </div>
          </div>
        </section>

        <section className="landing-features landing-inner" aria-labelledby="landing-features-title">
          <h2 id="landing-features-title">Made for design engineers.</h2>
          <div className="landing-feature-columns">
            <article className="landing-feature">
              <span className="landing-feature-index">01</span>
              <h3>Tweak designs directly in your codebase</h3>
              <p>Point the inspector at any element. Edits land as managed CSS rules and component props in your source files — no inline styles, no drift.</p>
            </article>
            <span className="landing-vrule" aria-hidden="true" />
            <article className="landing-feature">
              <span className="landing-feature-index">02</span>
              <h3>A canvas to preview and iterate</h3>
              <p>Select, inspect and experiment live in the browser. Every change renders exactly where your components actually run — then snapshot or undo it.</p>
            </article>
            <span className="landing-vrule" aria-hidden="true" />
            <article className="landing-feature">
              <span className="landing-feature-index">03</span>
              <h3>Components, tokens and styles supported</h3>
              <p>Semantic props rerender through your framework adapter. Design tokens, typography and shared styles stay consistent across the whole project.</p>
            </article>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-content landing-inner">
          <span>Nudge UI — dev-only by design</span>
          <span className="landing-footer-meta">data-cid · managed css · zero prod footprint</span>
        </div>
      </footer>
    </div>
  );
}
