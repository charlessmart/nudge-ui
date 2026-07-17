import "./conformance.css";

export function ConformancePage() {
  return (
    <main className="conformance-page">
      <h1>Token conformance fixtures</h1>
      <article className="conformance-card" data-cid="ConformanceCard" data-src="src/ConformancePage.tsx:8:5">
        <h2 data-cid="ConformanceHeading" data-src="src/ConformancePage.tsx:9:9">Authored values stay visible</h2>
        <p className="conformance-copy" data-cid="ConformanceCopy" data-src="src/ConformancePage.tsx:10:9">The browser paints a computed preview while the inspector keeps the CSS expression.</p>
      </article>
    </main>
  );
}
