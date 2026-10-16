import type { ReactElement } from "react";

/** Real DOM supplies computed values until the remaining editors accept view models. */
export function FixtureTargets(): ReactElement {
  return <div className="fixture-targets" aria-hidden="true" inert>
    <h2 className="fixture-text" data-fixture="text">Make room for a better idea</h2>
    <div className="fixture-flex" data-fixture="flex"><span>One</span><span>Two</span><span>Three</span></div>
    <div className="fixture-grid" data-fixture="grid"><span>One</span><span>Two</span><span>Three</span></div>
    {["Save", "Publish", "Continue"].map((label) => <button key={label} className="fixture-button" data-fixture="button">{label}</button>)}
    <p className="fixture-mixed-a" data-fixture="mixed">A short description</p>
    <p className="fixture-mixed-b" data-fixture="mixed">A longer description with different typography</p>
  </div>;
}
