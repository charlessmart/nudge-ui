import { TYPOGRAPHY_CASES } from "../../../packages/inspector/src/conformance/typographyCases.ts";
import type { ConformanceFixture } from "../../../packages/inspector/src/conformance/fixture.ts";
import "./typography-conformance.css";

const SPECIMENS: Record<string, string> = {
  "type-direct-literals": "Measured type makes a dense interface feel calm.",
  "type-tokenized-longhands": "A token-backed paragraph keeps its rhythm across surfaces.",
  "type-functional-raw": "Functional values remain editable exactly as they were authored.",
  "type-font-shorthand": "A shorthand still yields safe longhand controls.",
  "type-keywords-and-negative-tracking": "Keywords should not be normalised into guessed values.",
  "type-var-fallback-family": "A family fallback retains commas inside the raw authored value.",
};

function scopedCss(fixture: ConformanceFixture, targetClass: string): string {
  return fixture.css
    .replace(/:root\b/g, `.${targetClass}`)
    .replace(/\.subject\b/g, `.${targetClass}`);
}

function expectedProperties(fixture: ConformanceFixture): string[] {
  return Object.entries(fixture.expected.properties).map(([property, expected]) => {
    const token = expected.tokens?.length ? ` · ${expected.tokens.join(", ")}` : "";
    return `${property}: ${expected.authored}${token} · ${expected.capability}`;
  });
}

function caseIdentity(fixture: ConformanceFixture, index: number) {
  return import.meta.env.DEV
    ? {
        "data-cid": `TypographyConformance:${fixture.id}`,
        "data-src": `src/TypographyConformancePage.tsx:${index + 1}:1`,
        "data-test": `typography-case-${fixture.id}`,
      }
    : {};
}

function TypographyCase({ fixture, index }: { fixture: ConformanceFixture; index: number }) {
  const targetClass = `typography-target-${fixture.id}`;
  const properties = expectedProperties(fixture);

  return (
    <article className="typography-case">
      <style dangerouslySetInnerHTML={{ __html: scopedCss(fixture, targetClass) }} />
      <header className="typography-case__header">
        <span>Case {String(index + 1).padStart(2, "0")}</span>
        <h2>{fixture.id}</h2>
        <span className="typography-case__hint">select specimen</span>
      </header>
      <div className="typography-case__body">
        <div className="typography-specimen-frame">
          <span className="typography-specimen-frame__label">Live specimen</span>
          <div className={`${targetClass} typography-specimen`} {...caseIdentity(fixture, index)}>
            {SPECIMENS[fixture.id]}
          </div>
        </div>
        <div className="typography-case__evidence">
          <div>
            <p>Authored CSS</p>
            <pre><code>{fixture.css}</code></pre>
          </div>
          <div>
            <p>Expected inspector fields</p>
            <ul>{properties.map((property) => <li key={property}>{property}</li>)}</ul>
          </div>
        </div>
      </div>
    </article>
  );
}

export function TypographyConformancePage() {
  return (
    <main className="typography-conformance-page">
      <header className="typography-conformance-hero">
        <p>Dev-only browser corpus</p>
        <h1>Typography<br />conformance.</h1>
        <div className="typography-conformance-hero__support">
          <span>English specimens · 5 editable controls</span>
          <span>{TYPOGRAPHY_CASES.length} shared cases</span>
          <span>authored · computed · editable</span>
        </div>
      </header>
      <section className="typography-case-list" aria-label="Typography conformance cases">
        {TYPOGRAPHY_CASES.map((fixture, index) => <TypographyCase key={fixture.id} fixture={fixture} index={index} />)}
      </section>
    </main>
  );
}
