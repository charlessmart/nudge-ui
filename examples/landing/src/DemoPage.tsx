import type { ReactNode } from "react";

interface DemoPageProps {
  enabled: boolean;
}

export function DemoPage({ enabled }: DemoPageProps): ReactNode {
  if (!enabled) {
    return (
      <main className="demo-disabled">
        <p className="demo-eyebrow">Nudge UI demo</p>
        <h1>This route needs the explicit demo flag.</h1>
        <p>Open <code>/demo?nudgeDemo=1</code> to mount the inspector.</p>
      </main>
    );
  }

  return (
    <div className="demo-page" data-testid="demo-page">
      <header className="demo-header">
        <span className="demo-brand"><span className="demo-brand-mark" aria-hidden="true" />northline</span>
        <span className="demo-mode">Nudge UI demo · Canvas off</span>
      </header>
      <main className="demo-content">
        <section className="demo-copy" aria-labelledby="demo-title">
          <p className="demo-eyebrow">A calmer way to ship</p>
          <h1 id="demo-title">Make the last 10%<br /><span>feel finished.</span></h1>
          <p className="demo-description">Select anything on this page. The real inspector is mounted beside it, with changes kept local to this frame.</p>
          <div className="demo-actions"><button type="button" className="demo-primary">Open workspace <span aria-hidden="true">↗</span></button><a href="#details">See how it works</a></div>
        </section>
        <aside className="demo-card" id="details">
          <span className="demo-card-icon" aria-hidden="true">✦</span>
          <strong>One clear next step</strong>
          <span>Keep the useful part in view.</span>
          <div className="demo-card-rule" aria-hidden="true" />
          <small>Source stays close to the surface.</small>
        </aside>
      </main>
      <footer className="demo-footer"><span>Live component preview</span><span>Explicit demo mode</span></footer>
    </div>
  );
}
