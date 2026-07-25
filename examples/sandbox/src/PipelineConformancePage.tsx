import "./pipeline-conformance.css";

export const PIPELINE_CASES = [
  "token-color",
  "raw-fallback-color",
  "physical-spacing",
  "logical-spacing",
  "simple-border",
  "typography-shorthand",
  "flex-layout",
] as const;

export function PipelineConformancePage() {
  return (
    <main className="pipeline-conformance-page">
      <header className="pipeline-conformance-page__header">
        <p>Static CSS through Vite</p>
        <h1>Pipeline conformance</h1>
        <p>
          Each specimen is authored in an imported stylesheet so the token
          catalog, CSSOM resolver, Inspector, managed stylesheet, and painted
          result are exercised as one path.
        </p>
      </header>

      <section className="pipeline-conformance-page__cases" aria-label="Pipeline conformance cases">
        <article className="pipeline-case pipeline-case--token-color" data-test="pipeline-case-token-color">
          <h2>Token color</h2>
          <p>Known project color token.</p>
        </article>
        <article className="pipeline-case pipeline-case--raw-fallback-color" data-test="pipeline-case-raw-fallback-color">
          <h2>Fallback color</h2>
          <p>Unknown token stays an authored raw expression.</p>
        </article>
        <article className="pipeline-case pipeline-case--physical-spacing" data-test="pipeline-case-physical-spacing">
          <h2>Physical spacing</h2>
          <p>Two-value padding shorthand maps to grouped controls.</p>
        </article>
        <article className="pipeline-case pipeline-case--logical-spacing" data-test="pipeline-case-logical-spacing">
          <h2>Logical spacing</h2>
          <p>Inline spacing keeps its token attribution.</p>
        </article>
        <article className="pipeline-case pipeline-case--simple-border" data-test="pipeline-case-simple-border">
          <h2>Simple border</h2>
          <p>Border shorthand exposes its editable parts.</p>
        </article>
        <article className="pipeline-case pipeline-case--typography-shorthand" data-test="pipeline-case-typography-shorthand">
          <h2>Typography shorthand</h2>
          <p>Font shorthand retains its authored font-size source.</p>
        </article>
        <article className="pipeline-case pipeline-case--flex-layout" data-test="pipeline-case-flex-layout">
          <h2>Flex layout</h2>
          <p>Layout controls reflect the rendered flex context.</p>
        </article>
      </section>
    </main>
  );
}
