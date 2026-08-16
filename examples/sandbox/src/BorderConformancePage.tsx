import { BORDER_CASES } from "../../../packages/inspector/src/conformance/borderCases.ts";
import type { ConformanceFixture, ConformancePropertyExpectation } from "../../../packages/inspector/src/conformance/fixture.ts";
import "./border-conformance.css";
import type { StringRecord } from "./stringRecord.ts";

const CASE_NOTES: StringRecord = {
  "border-shorthand-literal": "Full three-part shorthand decomposes into linked width, style, and color.",
  "border-shorthand-token-color": "Token-backed border color stays linked to its token chip.",
  "border-shorthand-keyword-width-style": "Keyword width (thin) + style + named color all decompose.",
  "border-shorthand-order-permutation": "Component order is free; color/style/width still split correctly.",
  "border-side-specific": "border-top shorthand expands only the top longhands with token color.",
  "border-side-specific-right": "border-right shorthand expands only the right longhands.",
  "border-shorthand-override-longhand": "Side longhand overrides win over the shared shorthand.",
  "border-none-style": "border: none → style none with CSS initials; UI keeps style, hides width/color.",
  "border-hidden-style": "border: hidden → style hidden with CSS initials; same style-gated UI.",
  "border-incomplete-shorthand": "Omitted color becomes currentcolor (CSS initial), not a raw field.",
  "border-unresolved-token-color": "Unknown color token stays structured; color field keeps the var().",
  "border-radius-atomic": "Single-value border-radius is atomic and editable.",
  "border-radius-token": "Token-backed border-radius stays linked to its token.",
  "border-radius-shorthand": "Multi-value border-radius stays raw (no false corner split).",
  "border-width-longhand-four-value": "Four-value border-width stays raw.",
  "border-style-longhand-multi": "Multi-value border-style stays raw.",
  "border-color-longhand-token": "border-color longhand with a token stays structured/token-linked.",
  "border-longhands-separate": "Separate width/style/color longhands each keep their own tokens.",
  "border-collapse-reset": "Later border-style: none overrides the shorthand style face.",
  "border-width-single": "Single border-width longhand is atomic.",
  "border-top-width-longhand": "Side width longhand is atomic and editable.",
  "border-all-sides-different": "Four different side shorthands expand independently.",
};

function scopedCss(fixture: ConformanceFixture, targetClass: string): string {
  return fixture.css
    .replace(/:root\b/g, `.${targetClass}`)
    .replace(/\.subject\b/g, `.${targetClass}`);
}

/**
 * What the inspector field should show — the decomposed component for
 * structured borders, not the full authored shorthand repeated on every face.
 */
function fieldDisplayValue(property: string, expected: ConformancePropertyExpectation): string {
  const structure = expected.structure;
  if (structure) {
    if (property.endsWith("-width") && structure.width) return structure.width;
    if (property.endsWith("-style") && structure.style) return structure.style;
    if (property.endsWith("-color") && structure.color) return structure.color;
  }
  return expected.authored;
}

function expectedProperties(fixture: ConformanceFixture): string[] {
  return Object.entries(fixture.expected.properties).map(([property, expected]) => {
    const value = fieldDisplayValue(property, expected);
    const token = expected.tokens?.length ? ` · token ${expected.tokens.join(", ")}` : "";
    return `${property}: ${value}${token}`;
  });
}

function BorderCaseCard({ fixture, index }: { fixture: ConformanceFixture; index: number }) {
  const targetClass = `border-target-${fixture.id}`;
  const properties = expectedProperties(fixture);
  const note = CASE_NOTES[fixture.id] ?? "Shared border corpus case.";

  return (
    <article className="border-case-card">
      <style dangerouslySetInnerHTML={{ __html: scopedCss(fixture, targetClass) }} />
      <header className="border-case-card__header">
        <div>
          <p className="border-case-card__index">Case {String(index + 1).padStart(2, "0")}</p>
          <h2>{fixture.id}</h2>
          <p className="border-case-card__note">{note}</p>
        </div>
        <span className="border-case-card__status">selectable</span>
      </header>

      <div className="border-case-card__body">
        <div className="border-case-card__stage">
          <div className="border-target-label">click the sample to inspect</div>
          <div
            className={`${targetClass} border-target`}
            data-cid={import.meta.env.DEV ? `BorderConformance:${fixture.id}` : undefined}
            data-src={import.meta.env.DEV ? `src/BorderConformancePage.tsx:${index + 1}:1` : undefined}
            data-test={import.meta.env.DEV ? `border-case-${fixture.id}` : undefined}
          >
            <strong>Border sample</strong>
            <span>Rendered with the fixture&rsquo;s authored CSS</span>
          </div>
        </div>

        <div className="border-case-card__details">
          <div>
            <p className="border-case-card__label">Authored CSS</p>
            <pre><code>{fixture.css}</code></pre>
          </div>
          <div>
            <p className="border-case-card__label">Expected inspector rows</p>
            <ul>
              {properties.map((property) => <li key={property}>{property}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </article>
  );
}

export function BorderConformancePage() {
  return (
    <main className="border-conformance-page">
      <header className="border-conformance-hero">
        <p className="border-conformance-eyebrow">Dev-only browser corpus</p>
        <h1>Border conformance</h1>
        <p>
          Select each sample and compare authored CSS with the inspector. Shorthands decompose into
          width, style, and color — omitted parts use CSS initials (<code>medium</code> /{" "}
          <code>none</code> / <code>currentcolor</code>). Style <code>none</code>/<code>hidden</code>{" "}
          keeps the style control and hides width/color until a drawn style is chosen. Only truly
          ambiguous values stay raw.
        </p>
        <div className="border-conformance-meta">
          <span>{BORDER_CASES.length} shared cases</span>
          <span>·</span>
          <span>unit-tested and selectable</span>
        </div>
      </header>

      <section className="border-case-list" aria-label="Border conformance cases">
        {BORDER_CASES.map((fixture, index) => <BorderCaseCard key={fixture.id} fixture={fixture} index={index} />)}
      </section>
    </main>
  );
}
