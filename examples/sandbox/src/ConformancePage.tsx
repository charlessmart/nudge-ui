import "./conformance.css";

const cardIdentity = import.meta.env.DEV ? { "data-cid": "ConformanceCard", "data-src": "src/ConformancePage.tsx:8:5" } : {};
const headingIdentity = import.meta.env.DEV ? { "data-cid": "ConformanceHeading", "data-src": "src/ConformancePage.tsx:9:9" } : {};
const copyIdentity = import.meta.env.DEV ? { "data-cid": "ConformanceCopy", "data-src": "src/ConformancePage.tsx:10:9" } : {};

export function ConformancePage() {
  return (
    <main className="conformance-page">
      <h1>Token conformance fixtures</h1>
      <article className="conformance-card" {...cardIdentity}>
        <h2 {...headingIdentity}>Authored values stay visible</h2>
        <p className="conformance-copy" {...copyIdentity}>The browser paints a computed preview while the inspector keeps the CSS expression.</p>
      </article>
    </main>
  );
}
