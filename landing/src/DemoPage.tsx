import type { ReactNode } from "react";
import { DemoButton } from "./DemoButton";

export function DemoPage(): ReactNode {
  return (
    <div className="demo-page" data-testid="demo-page">
      <main className="demo-content">
        <section className="demo-copy" aria-labelledby="demo-title">
          <h1 id="demo-title">Nudge is for<br /><span>For getting the final 20% right, faster</span></h1>
          <p className="demo-description">Getting the final design details right with an agent is like backseat driving. Nudge lets you design your real code like it&apos;s Figma.</p>
          <div className="demo-actions"><DemoButton label="Get started" variant="primary" disabled={false} showArrow={true} /></div>
        </section>
      </main>
    </div>
  );
}
