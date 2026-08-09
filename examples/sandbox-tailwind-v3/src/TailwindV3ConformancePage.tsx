const cardIdentity = import.meta.env.DEV
  ? { "data-cid": "TailwindV3Card", "data-src": "src/TailwindV3ConformancePage.tsx:8:5", "data-test": "tailwind-v3-card" }
  : {};

export function TailwindV3ConformancePage() {
  return (
    <main className="v3-page bg-slate-50 text-slate-900">
      <h1 className="mb-6 text-3xl font-bold">Tailwind v3 conformance</h1>
      <article className="v3-card rounded-lg bg-brand/10 p-3 text-brand" {...cardIdentity}>
        Real Tailwind v3 utilities are compiled by PostCSS.
      </article>
    </main>
  );
}

