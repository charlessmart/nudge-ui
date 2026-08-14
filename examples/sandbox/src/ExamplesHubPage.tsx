import "./conformance.css";

export function ExamplesHubPage() {
  return (
    <main className="conformance-page">
      <h1>CSS library examples</h1>
      <p>Each link opens a standalone consumer with its own stylesheet graph and compiler.</p>
      <nav className="conformance-card" aria-label="Example applications">
        <a href="/examples/raw-css">Raw CSS examples</a>
        <a href="http://localhost:5174/examples">Tailwind v4 examples</a>
        <a href="http://localhost:5175/examples">Tailwind v3 examples</a>
        <a href="http://localhost:5176/examples">Sprinkles examples</a>
      </nav>
    </main>
  );
}
