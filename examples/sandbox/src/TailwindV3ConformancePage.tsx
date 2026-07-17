import "./tailwind-v3-conformance.css";

const cardIdentity = import.meta.env.DEV ? { "data-cid": "TailwindV3Card", "data-src": "src/TailwindV3ConformancePage.tsx:7:7" } : {};

export function TailwindV3ConformancePage() {
  return (
    <main className="v3-page">
      <h1>Tailwind v3 conformance fixture</h1>
      <div className="bg-brand/10 v3-card" {...cardIdentity} data-test="tailwind-v3-card">
        Config-derived color plus opacity helper
      </div>
    </main>
  );
}
