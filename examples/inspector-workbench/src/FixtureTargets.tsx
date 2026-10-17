import type { ReactElement } from "react";
import { WorkbenchBadge } from "./components/WorkbenchBadge.tsx";
import { WorkbenchButton } from "./components/WorkbenchButton.tsx";
import { WorkbenchCard } from "./components/WorkbenchCard.tsx";

/** Visible instances for selecting with the outer Nudge inspector. */
export function ComponentExamples(): ReactElement {
  return <section className="workbench-components" aria-label="Component examples">
    <h2>Components</h2>
    {["Publish changes", "Save draft", "Share", "Export", "Archive"].map((label) => (
      <WorkbenchButton key={label} label={label} variant="primary" size="large" disabled={false} />
    ))}
    <WorkbenchBadge label="Beta" tone="success" size="small" />
    <WorkbenchCard variant="outlined" padding="medium">
      <WorkbenchBadge label="Draft" tone="warning" size="small" />
      <WorkbenchButton label="Save" variant="secondary" size="small" disabled={false} />
    </WorkbenchCard>
    <div className="workbench-margin-demo">
      <div className="workbench-margin-box">Box with margin</div>
    </div>
  </section>;
}

/** Real DOM supplies computed values until the remaining editors accept view models. */
export function FixtureTargets(): ReactElement {
  return <div className="fixture-targets" aria-hidden="true" inert>
    <h2 className="fixture-text" data-fixture="text">Make room for a better idea</h2>
    <div className="fixture-flex" data-fixture="flex"><span>One</span><span>Two</span><span>Three</span></div>
    <div className="fixture-grid" data-fixture="grid"><span>One</span><span>Two</span><span>Three</span></div>
    {["Save", "Publish", "Continue"].map((label) => <button key={label} className="fixture-button" data-fixture="button">{label}</button>)}
    <div data-fixture="component-button" data-fixture-select="button" className="fixture-component"><WorkbenchButton label="Publish changes" variant="primary" size="large" disabled={false} /></div>
    <div data-fixture="component-badge" data-fixture-select="span" className="fixture-component"><WorkbenchBadge label="Beta" tone="success" size="small" /></div>
    <div data-fixture="component-card" data-fixture-select=".wb-card" className="fixture-component"><WorkbenchCard variant="outlined" padding="medium"><WorkbenchButton label="Save" variant="secondary" size="small" disabled={false} /></WorkbenchCard></div>
    <div data-fixture="component-nested" data-fixture-select="button" className="fixture-component"><WorkbenchCard variant="outlined" padding="medium"><WorkbenchButton label="Save" variant="secondary" size="small" disabled={false} /></WorkbenchCard></div>
    <p className="fixture-mixed-a" data-fixture="mixed">A short description</p>
    <p className="fixture-mixed-b" data-fixture="mixed">A longer description with different typography</p>
  </div>;
}
