import { SPACING_CASES } from "../../../packages/inspector/src/conformance/spacingCases.ts";
import type { ConformanceFixture } from "../../../packages/inspector/src/conformance/fixture.ts";
import "./spacing-conformance.css";

function scopedCss(fixture: ConformanceFixture, targetClass: string): string {
  return fixture.css.replace(/\.subject\b/g, `.${targetClass}`);
}

function expectedProperties(fixture: ConformanceFixture): string[] {
  return Object.entries(fixture.expected.properties).map(([property, expected]) => {
    const token = expected.tokens?.length ? ` · ${expected.tokens.join(", ")}` : "";
    return `${property}: ${expected.authored}${token}`;
  });
}

function caseIdentity(fixture: ConformanceFixture, index: number) {
  return import.meta.env.DEV
    ? {
        "data-cid": `SpacingConformance:${fixture.id}`,
        "data-src": `src/SpacingConformancePage.tsx:${index + 1}:1`,
        "data-test": `spacing-case-${fixture.id}`,
      }
    : {};
}

function SpacingCaseCard({ fixture, index }: { fixture: ConformanceFixture; index: number }) {
  const targetClass = `spacing-target-${fixture.id}`;
  const properties = expectedProperties(fixture);

  return (
    <article className="spacing-case-card">
      <style dangerouslySetInnerHTML={{ __html: scopedCss(fixture, targetClass) }} />
      <header className="spacing-case-card__header">
        <div>
          <p className="spacing-case-card__index">Case {String(index + 1).padStart(2, "0")}</p>
          <h2>{fixture.id}</h2>
        </div>
        <span className="spacing-case-card__status">selectable</span>
      </header>

      <div className="spacing-case-card__body">
        <div className="spacing-case-card__stage">
          <div className="spacing-target-label">click the sample to inspect</div>
          <div className={`${targetClass} spacing-target`} {...caseIdentity(fixture, index)}>
            <strong>Spacing sample</strong>
            <span>Rendered with the fixture’s authored CSS</span>
          </div>
        </div>

        <div className="spacing-case-card__details">
          <div>
            <p className="spacing-case-card__label">Authored CSS</p>
            <pre><code>{fixture.css}</code></pre>
          </div>
          <div>
            <p className="spacing-case-card__label">Expected inspector rows</p>
            <ul>
              {properties.map((property) => <li key={property}>{property}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </article>
  );
}

export function SpacingConformancePage() {
  return (
    <main className="spacing-conformance-page">
      <header className="spacing-conformance-hero">
        <p className="spacing-conformance-eyebrow">Dev-only browser corpus</p>
        <h1>Spacing conformance</h1>
        <p>
          Select each sample and compare the authored CSS with the inspector’s compact two-axis view.
          Expand the spacing control when you need to check individual sides, then edit and confirm the live result.
        </p>
        <div className="spacing-conformance-meta">
          <span>{SPACING_CASES.length} shared cases</span>
          <span>·</span>
          <span>unit-tested and selectable</span>
        </div>
      </header>

      <section className="spacing-case-list" aria-label="Spacing conformance cases">
        {SPACING_CASES.map((fixture, index) => <SpacingCaseCard key={fixture.id} fixture={fixture} index={index} />)}
      </section>
    </main>
  );
}
