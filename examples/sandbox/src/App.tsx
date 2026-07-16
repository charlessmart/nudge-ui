import { useEffect, useState } from "react";
import { Button } from "./Button";
import { Footer } from "./Footer";
import { RepeatedItem } from "./RepeatedItem";
import { tokenCatalog, tokens } from "virtual:design-tokens";

if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __designTokens?: unknown }).__designTokens = tokens;
  (window as unknown as { __designTokenCatalog?: unknown }).__designTokenCatalog = tokenCatalog;
}

const featureList = [
  {
    index: "01",
    title: "Inspect the real thing",
    copy: "Select any element in your running app and see its source, tokens, and layout in one calm view.",
  },
  {
    index: "02",
    title: "Change with intent",
    copy: "Try spacing, type, color, and layout edits live. Every adjustment stays attached to the source.",
  },
  {
    index: "03",
    title: "Hand off precisely",
    copy: "Copy a structured prompt with selectors and file locations your coding agent can act on immediately.",
  },
];

const typeSamples = [
  { label: "Display", className: "type-display", value: "Make the interface yours." },
  { label: "Body", className: "type-body", value: "Good tools make the distance between an idea and a finished detail feel wonderfully small." },
  { label: "Mono", className: "type-mono", value: "--space-3 · 16px · var(--color-text-primary)" },
];

export function App() {
  const [clicks, setClicks] = useState(0);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __designToolRerender?: () => void }).__designToolRerender = () =>
      setClicks((c) => c + 1);
    return () => {
      delete (window as unknown as { __designToolRerender?: () => void }).__designToolRerender;
    };
  }, []);

  return (
    <div>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="Design Tool home">
          <span className="wordmark-mark" aria-hidden="true">✳</span>
          <span>design tool</span>
        </a>
        <nav className="site-nav" aria-label="Main navigation">
          <a href="#features">Why it works</a>
          <a href="#showcase">Components</a>
          <a href="#handoff">Handoff</a>
        </nav>
        <a className="header-cta" href="#showcase">Open sandbox <span aria-hidden="true">↗</span></a>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-dot" /> Vite plugin · React first</p>
            <h1 id="hero-title">Design at the speed of thought.</h1>
            <p className="hero-intro">
              Design Tool brings a visual editing loop to your local dev server, so the jump from “what if?” to source code stays tiny.
            </p>
            <div className="hero-actions">
              <Button label="Save a change" variant="primary" onClick={() => setClicks((c) => c + 1)} />
              <a className="text-link" href="#features">See how it works <span aria-hidden="true">↓</span></a>
            </div>
            <p className="hero-meta"><span className="status-dot" /> local, private, dev-only <span className="meta-divider">·</span> <span data-test="click-counter">clicks: {clicks}</span></p>
          </div>

          <div className="hero-visual" aria-label="A preview of the Design Tool inspector">
            <div className="visual-topline">
              <span className="window-dots"><i /><i /><i /></span>
              <span className="visual-url">localhost:5173 / sandbox</span>
              <span className="visual-mode">● LIVE</span>
            </div>
            <div className="visual-body">
              <div className="visual-page">
                <div className="visual-page-nav"><span className="mini-logo">✳</span><span /><span /><span /></div>
                <div className="visual-page-content">
                  <div className="mini-kicker">SELECTED ELEMENT</div>
                  <div className="mini-heading">Move ideas<br /><em>into view.</em></div>
                  <div className="mini-line" /><div className="mini-line short" />
                  <div className="mini-button">Save a change <b>↗</b></div>
                </div>
                <div className="selection-outline"><span>Hero / h1</span></div>
              </div>
              <aside className="visual-inspector">
                <div className="inspector-header"><span>Inspector</span><span>×</span></div>
                <div className="inspector-breadcrumb">App <b>/</b> Hero <b>/</b> h1</div>
                <div className="inspector-section"><span>Typography</span><span>⌃</span></div>
                <div className="inspector-row"><span>font-size</span><strong>64px</strong></div>
                <div className="inspector-row"><span>line-height</span><strong>0.98</strong></div>
                <div className="inspector-section"><span>Color</span><span>⌃</span></div>
                <div className="token-readout"><span className="token-swatch" /> --color-text-primary <b>⌄</b></div>
                <div className="inspector-footer"><span className="tiny-dot" /> 3 changes ready</div>
              </aside>
            </div>
          </div>
        </section>

        <section className="feature-section" id="features" aria-labelledby="features-title">
          <div className="section-heading">
            <p className="eyebrow">The short version</p>
            <h2 id="features-title">A better loop for the last 10%.</h2>
          </div>
          <div className="feature-list">
            {featureList.map((feature) => (
              <article className="feature-item" key={feature.index}>
                <span className="feature-index">{feature.index}</span>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
                <span className="feature-arrow" aria-hidden="true">↗</span>
              </article>
            ))}
          </div>
        </section>

        <section className="showcase-section" id="showcase" aria-labelledby="showcase-title">
          <div className="showcase-heading">
            <div>
              <p className="eyebrow">A small component playground</p>
              <h2 id="showcase-title">Everything here is<br /><em>selectable.</em></h2>
            </div>
            <p className="showcase-note">Click around. This section is deliberately made from common building blocks to make the inspector useful in context.</p>
          </div>

          <div className="demo-grid">
            <div className="demo-panel component-panel">
              <div className="panel-kicker">Repeated components <span>6 instances</span></div>
              <div className="component-list" data-test="repeated-items">
                {Array.from({ length: 6 }, (_, index) => (
                  <RepeatedItem key={index} label={`Repeated ${index + 1}`} />
                ))}
              </div>
              <p className="panel-caption">Edit one instance or the source component.</p>
            </div>

            <div className="demo-panel layout-panel">
              <div className="panel-kicker">Layout lab <span>flex + position</span></div>
              <p className="layout-title">A row with room<br />to breathe.</p>
              <div className="flex-row" data-test="flex-container">
                <span data-test="flex-child-a">A</span>
                <span data-test="flex-child-b">B</span>
                <span data-test="flex-child-c">C</span>
              </div>
              <div className="positioned-box" data-test="positioned-box">
                <span className="position-pin">+</span> positioned element
              </div>
            </div>
          </div>
        </section>

        <section className="type-section" aria-labelledby="type-title">
          <div className="type-intro">
            <p className="eyebrow">Tokens in context</p>
            <h2 id="type-title">See the system,<br /><em>not just the screen.</em></h2>
            <p>Typography, color, spacing, and layout are easier to tune when you can see the relationships between them.</p>
          </div>
          <div className="type-samples">
            {typeSamples.map((sample) => (
              <div className="type-sample" key={sample.label}>
                <span className="sample-label">{sample.label}</span>
                <p className={sample.className}>{sample.value}</p>
              </div>
            ))}
          </div>
          <div className="token-strip" aria-label="Token examples">
            <span><i className="swatch swatch-purple" /> color.primary</span>
            <span><i className="swatch swatch-yellow" /> space.3</span>
            <span><i className="swatch swatch-mint" /> radius.lg</span>
          </div>
        </section>

        <section className="handoff-section" id="handoff" aria-labelledby="handoff-title">
          <div className="handoff-copy">
            <p className="eyebrow">From canvas to code</p>
            <h2 id="handoff-title">Make the change.<br /><em>Keep the context.</em></h2>
          </div>
          <div className="prompt-preview">
            <div className="prompt-bar"><span>design-changes.md</span><span>copied to clipboard</span></div>
            <pre>{`# Design changes for Hero.tsx\n\n### Hero (src/Hero.tsx:42)\n- font-size: 56px → 64px\n- color: text.secondary → text.primary\n\n## Selectors (fallback)\n[data-cid="Hero"][data-src*="Hero.tsx"]`}</pre>
          </div>
        </section>

        {import.meta.env.DEV ? (
          <section className="token-reference" data-test="tokens" aria-labelledby="token-title">
            <div>
              <p className="eyebrow">Dev mode reference</p>
              <h2 id="token-title">The live token table.</h2>
            </div>
            <ul>
              {tokens.map((token) => (
                <li key={token.name} data-token-name={token.name}>
                  <span>{token.name}</span><code>{token.value}</code>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
      <Footer />
    </div>
  );
}
