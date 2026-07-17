import "./sprinkles-conformance.css";

const brandIdentity = import.meta.env.DEV ? { "data-cid": "SprinklesCard", "data-src": "src/SprinklesConformancePage.tsx:7:7" } : {};
const rawIdentity = import.meta.env.DEV ? { "data-cid": "SprinklesRaw", "data-src": "src/SprinklesConformancePage.tsx:8:7" } : {};

export function SprinklesConformancePage() {
  return (
    <main className="sprinkles-page">
      <h1>Sprinkles conformance fixture</h1>
      <p className="sprinkles-brand" {...brandIdentity} data-test="sprinkles-card">Human-readable theme contract mapping</p>
      <p className="sprinkles-unknown" {...rawIdentity} data-test="sprinkles-raw">Unmapped atomic class remains raw</p>
    </main>
  );
}
