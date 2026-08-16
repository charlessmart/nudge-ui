import { COLOR_CASES } from "../../../packages/inspector/src/conformance/colorCases.ts";
import type { ConformanceFixture } from "../../../packages/inspector/src/conformance/fixture.ts";
import "./color-conformance.css";
import type { StringRecord } from "./stringRecord.ts";

const SPECIMENS: StringRecord = {
  "color-named-keywords": "Named keywords keep their authored spelling.",
  "color-hex-short": "Short hex codes remain authored exactly as written.",
  "color-hex-six-digit": "Six-digit hex colors span the full gamut.",
  "color-hex-alpha-eight": "Eight-digit hex with alpha channel preserves the full authored value.",
  "color-hex-four-digit": "Four-digit hex with alpha shorthand.",
  "color-rgb-legacy": "Legacy comma-separated rgb and rgba syntax.",
  "color-rgb-modern": "Modern space-separated rgb with optional alpha.",
  "color-rgb-percent": "Percentage-based rgb channels.",
  "color-hsl-legacy": "Legacy comma-separated hsl and hsla syntax.",
  "color-hsl-modern": "Modern space-separated hsl with alpha.",
  "color-oklch": "oklch color space with chromatic coverage.",
  "color-oklab": "oklab and lab color spaces.",
  "color-transparent-currentcolor": "Special keywords are kept as-authored.",
  "color-system-keywords": "Deprecated system color keywords.",
  "color-token-simple": "Token-backed colors across foreground and background.",
  "color-token-fallback": "Tokens with fallback values keep the authored fallback intact.",
  "color-token-bg-only": "Background-color only, no foreground token.",
  "color-token-unknown-fallback": "Unknown tokens should surface the raw expression.",
  "color-mix-token": "color-mix() preserves the authored expression with token references.",
  "color-fill-and-stroke": "fill and stroke are treated as color-capable properties.",
  "color-hex-comparison": "A companion element with both foreground and background.",
  "color-token-alias-chain": "An aliased token that points to another defined token.",
};

function scopedCss(fixture: ConformanceFixture, targetClass: string): string {
  return fixture.css
    .replace(/:root\b/g, `.${targetClass}`)
    .replace(/\.subject\b/g, `.${targetClass}`)
    .replace(/\.subject-two\b/g, `.${targetClass}-two`);
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
        "data-cid": `ColorConformance:${fixture.id}`,
        "data-src": `src/ColorConformancePage.tsx:${index + 1}:1`,
        "data-test": `color-case-${fixture.id}`,
      }
    : {};
}

function ColorCase({ fixture, index }: { fixture: ConformanceFixture; index: number }) {
  const targetClass = `color-target-${fixture.id}`;
  const properties = expectedProperties(fixture);

  return (
    <article className="color-case">
      <style dangerouslySetInnerHTML={{ __html: scopedCss(fixture, targetClass) }} />
      <header className="color-case__header">
        <span>Case {String(index + 1).padStart(2, "0")}</span>
        <h2>{fixture.id}</h2>
        <span className="color-case__hint">select specimen</span>
      </header>
      <div className="color-case__body">
        <div className="color-specimen-frame">
          <span className="color-specimen-frame__label">Live specimen</span>
          <div className={`${targetClass} color-specimen`} {...caseIdentity(fixture, index)}>
            {SPECIMENS[fixture.id]}
          </div>
        </div>
        <div className="color-case__evidence">
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

export function ColorConformancePage() {
  return (
    <main className="color-conformance-page">
      <header className="color-conformance-hero">
        <p>Dev-only browser corpus</p>
        <h1>Color<br />conformance.</h1>
        <div className="color-conformance-hero__support">
          <span>Named · hex · rgb · hsl · oklch · mix · tokens</span>
          <span>{COLOR_CASES.length} shared cases</span>
          <span>authored · computed · editable</span>
        </div>
      </header>
      <section className="color-case-list" aria-label="Color conformance cases">
        {COLOR_CASES.map((fixture, index) => <ColorCase key={fixture.id} fixture={fixture} index={index} />)}
      </section>
    </main>
  );
}
