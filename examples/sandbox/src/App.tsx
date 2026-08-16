import { useEffect, useState } from "react";
import { Button } from "./Button";
import { Footer } from "./Footer";
import { RepeatedItem } from "./RepeatedItem";
import { tokenCatalog, tokenDiagnostics, tokens } from "virtual:design-tokens";

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__designTokens = tokens;
  window.__designTokenCatalog = tokenCatalog;
  window.__designTokenDiagnostics = tokenDiagnostics;
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

const conformancePages = [
  { href: "/conformance", label: "Core CSS", copy: "Authored values, aliases, and computed previews." },
  { href: "/examples", label: "Example hub", copy: "Navigation to each isolated CSS-library consumer." },
  { href: "/examples/raw-css", label: "Examples: Raw CSS", copy: "Raw CSS examples in isolation for debugging token resolution." },
  { href: "http://localhost:5174/tailwind", label: "Tailwind v4 app", copy: "Standalone real Tailwind v4 consumer." },
  { href: "http://localhost:5175/tailwind-v3", label: "Tailwind v3 app", copy: "Standalone real Tailwind v3 consumer." },
  { href: "http://localhost:5176/sprinkles", label: "Sprinkles app", copy: "Standalone real vanilla-extract consumer." },
  { href: "/spacing-conformance", label: "Spacing", copy: "Logical properties and physical side projection." },
  { href: "/typography-conformance", label: "Typography", copy: "Text properties across the shared fixture corpus." },
  { href: "/color-conformance", label: "Color", copy: "Formats, opacity, aliases, and painted values." },
  { href: "/border-conformance", label: "Border", copy: "Shorthand structure and side-specific edits." },
];

const cssBorderFixtureIds = {
  accent: import.meta.env.DEV ? { "data-test": "css-border-accent" } : {},
  mixed: import.meta.env.DEV ? { "data-test": "css-border-mixed" } : {},
  override: import.meta.env.DEV ? { "data-test": "css-border-override" } : {},
};

const cssOpacityFixtureIds = {
  rgba: import.meta.env.DEV ? { "data-test": "css-opacity-rgba" } : {},
  hex: import.meta.env.DEV ? { "data-test": "css-opacity-hex" } : {},
};

function CssBorderExamples() {
  return (
    <section className="border-fixtures" aria-labelledby="border-fixtures-title">
      <div className="border-fixtures__header">
        <div>
          <p className="eyebrow">Edge cases worth inspecting</p>
          <h2 id="border-fixtures-title">One box, four border decisions.</h2>
        </div>
        <p className="border-fixtures__intro">
          These examples use ordinary CSS side longhands. Select one to see whether width, color, and style stay linked or fan out by side.
        </p>
      </div>
      <div className="border-fixtures__grid">
        <article className="border-fixture border-fixture--accent" {...cssBorderFixtureIds.accent}>
          <div className="border-fixture__meta"><span>01</span><span>Common</span></div>
          <h3>Accent edge</h3>
          <p>A shared border with one stronger left edge for hierarchy.</p>
          <code>border-left: 4px solid accent</code>
        </article>
        <article className="border-fixture border-fixture--mixed" {...cssBorderFixtureIds.mixed}>
          <div className="border-fixture__meta"><span>02</span><span>Mixed</span></div>
          <h3>Mixed treatment</h3>
          <p>Every side has its own width, color, and line style.</p>
          <code>top dashed · right solid · bottom double · left dotted</code>
        </article>
        <article className="border-fixture border-fixture--override" {...cssBorderFixtureIds.override}>
          <div className="border-fixture__meta"><span>03</span><span>Override</span></div>
          <h3>One-side override</h3>
          <p>A normal shared border with a deliberate bottom emphasis.</p>
          <code>border-bottom: 2px solid accent</code>
        </article>
      </div>
    </section>
  );
}

function CssOpacityExamples() {
  return (
    <section className="opacity-fixtures" aria-labelledby="opacity-fixtures-title">
      <div className="opacity-fixtures__header">
        <div>
          <p className="eyebrow">Color decisions worth inspecting</p>
          <h2 id="opacity-fixtures-title">Same color, less certainty.</h2>
        </div>
        <p className="opacity-fixtures__intro">
          These cards keep their authored alpha visible so you can select the background or text color and check the split color + opacity field.
        </p>
      </div>
      <div className="opacity-fixtures__grid">
        <article className="opacity-fixture opacity-fixture--rgba" {...cssOpacityFixtureIds.rgba}>
          <div className="opacity-fixture__meta"><span>01</span><span>rgba()</span></div>
          <h3>Soft signal</h3>
          <p>A warm accent that stays present without taking over the surface.</p>
          <code>background: rgba(196, 243, 107, 0.18)</code>
        </article>
        <article className="opacity-fixture opacity-fixture--hex" {...cssOpacityFixtureIds.hex}>
          <div className="opacity-fixture__meta"><span>02</span><span>8-digit hex</span></div>
          <h3>Quiet highlight</h3>
          <p>An authored alpha channel that should remain editable as its own value.</p>
          <code>background: #d9c8ff33</code>
        </article>
      </div>
    </section>
  );
}

export function App() {
  const [clicks, setClicks] = useState(0);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__designToolRerender = () =>
      setClicks((c) => c + 1);
    return () => {
      delete window.__designToolRerender;
    };
  }, []);

  return (
    <div className="site-shell">
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
        <a className="header-cta" href="/examples">Open examples <span aria-hidden="true">↗</span></a>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-dot" /> Vite plugin · React first</p>
            <h1 id="hero-title">Inspect the work<br />while it is still moving.</h1>
            <p className="hero-intro">
              A local visual editor for the small decisions that make a product feel finished.
            </p>
            <div className="hero-actions">
              <Button label="Save a change" variant="primary" onClick={() => setClicks((c) => c + 1)} />
              <a className="text-link" href="#features">See how it works <span aria-hidden="true">↓</span></a>
            </div>
            <p className="hero-meta"><span className="status-dot" /> local, private, dev-only <span className="meta-divider">·</span> <span {...(import.meta.env.DEV ? { "data-test": "click-counter" } : {})}>clicks: {clicks}</span></p>
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
                  <div className="mini-heading">Move ideas<br /><span className="accent-word">into view.</span></div>
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
            <h2 id="features-title">A calmer loop for the last 10%.</h2>
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
              <h2 id="showcase-title">Everything here is<br /><span className="accent-word">selectable.</span></h2>
            </div>
            <p className="showcase-note">Click around. This section is deliberately made from common building blocks to make the inspector useful in context.</p>
          </div>

          <div className="demo-grid">
            <div className="demo-panel component-panel">
              <div className="panel-kicker">Repeated components <span>6 instances</span></div>
              <div className="component-list" {...(import.meta.env.DEV ? { "data-test": "repeated-items" } : {})}>
                {Array.from({ length: 6 }, (_, index) => (
                  <RepeatedItem key={index} label={`Repeated ${index + 1}`} />
                ))}
              </div>
              <p className="panel-caption">Edit one instance or the source component.</p>
            </div>

            <div className="demo-panel layout-panel">
              <div className="panel-kicker">Layout lab <span>flex + position</span></div>
              <p className="layout-title">A row with room<br />to breathe.</p>
              <div className="flex-row" {...(import.meta.env.DEV ? { "data-test": "flex-container" } : {})}>
                <span {...(import.meta.env.DEV ? { "data-test": "flex-child-a" } : {})}>A</span>
                <span {...(import.meta.env.DEV ? { "data-test": "flex-child-b" } : {})}>B</span>
                <span {...(import.meta.env.DEV ? { "data-test": "flex-child-c" } : {})}>C</span>
              </div>
              <div className="positioned-box" {...(import.meta.env.DEV ? { "data-test": "positioned-box" } : {})}>
                <span className="position-pin">+</span> positioned element
              </div>
              <div className="layout-fixtures" aria-label="Sizing, Grid, and absolute positioning fixtures">
                <div className="sizing-box" {...(import.meta.env.DEV ? { "data-test": "sizing-box" } : {})}>4:3 sizing box</div>
                <div className="relative-offset-box" {...(import.meta.env.DEV ? { "data-test": "relative-offset-box" } : {})}>relative offset</div>
                <div className="right-anchored-box" {...(import.meta.env.DEV ? { "data-test": "right-anchored-box" } : {})}>right / bottom</div>
                <div className="stretched-box" {...(import.meta.env.DEV ? { "data-test": "stretched-box" } : {})}>stretched</div>
                <div className="grid-authored-container" {...(import.meta.env.DEV ? { "data-test": "grid-authored-container" } : {})}>
                  <div className="grid-child-span" {...(import.meta.env.DEV ? { "data-test": "grid-child-span" } : {})}>span 3</div>
                  <div className="grid-child-auto">auto</div>
                </div>
                <div className="grid-switch-target" {...(import.meta.env.DEV ? { "data-test": "grid-switch-target" } : {})}>select me → grid</div>
              </div>
            </div>
          </div>
        </section>

        <section className="type-section" aria-labelledby="type-title">
          <div className="type-intro">
            <p className="eyebrow">Tokens in context</p>
            <h2 id="type-title">See the system,<br /><span className="accent-word">not just the screen.</span></h2>
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
            <h2 id="handoff-title">Make the change.<br /><span className="accent-word">Keep the context.</span></h2>
          </div>
          <div className="prompt-preview">
            <div className="prompt-bar"><span>design-changes.md</span><span>copied to clipboard</span></div>
            <pre>{`# Design changes for Hero.tsx\n\n### Hero (src/Hero.tsx:42)\n- font-size: 56px → 64px\n- color: text.secondary → text.primary\n\n## Selector fallback\nHero / src/Hero.tsx`}</pre>
          </div>
        </section>

        <CssBorderExamples />

        <CssOpacityExamples />

        {import.meta.env.DEV ? (
          <section className="conformance-links" data-test="conformance-links" aria-labelledby="conformance-links-title">
            <div className="conformance-links__header">
              <div>
                <p className="eyebrow">Dev mode reference</p>
                <h2 id="conformance-links-title">Test every surface.</h2>
              </div>
              <p>Open a focused fixture, select an element, and inspect how the authored CSS survives the browser.</p>
            </div>
            <nav className="conformance-links__list" aria-label="Conformance pages">
              {conformancePages.map((page) => (
                <a
                  className="conformance-link"
                  data-conformance-route={page.href}
                  data-design-tool-navigation="true"
                  data-test="conformance-link"
                  href={page.href}
                  key={page.href}
                >
                  <span className="conformance-link__label">{page.label}</span>
                  <span className="conformance-link__copy">{page.copy}</span>
                  <span className="conformance-link__arrow" aria-hidden="true">↗</span>
                </a>
              ))}
            </nav>
          </section>
        ) : null}

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
