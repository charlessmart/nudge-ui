import { useEffect, useState } from "react";
import { sprinkles } from "./sprinkles.css.ts";
import { themeClass } from "./theme.css.ts";

const brand = sprinkles({ color: "brand", backgroundColor: "surface", padding: "md" });
const alias = sprinkles({ color: "emphasis", backgroundColor: "surface", padding: "sm" });

export function App() {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__compatRerender = () => setRevision((current) => current + 1);
    return () => { delete window.__compatRerender; };
  }, []);

  return (
    <main className={`${themeClass} compat-page`}>
      <h1>Real vanilla-extract compatibility fixture</h1>
      <div className="fixture-grid">
        <article id="compiled-brand" key={`brand-${revision}`} className={`${brand} fixture-card`}>
          Compiled Sprinkles token, render {revision}
        </article>
        <article id="compiled-alias" className={`${alias} fixture-card`}>
          Alias token
        </article>
        <article id="order-before" className={`${brand} fixture-card order-before irrelevant-after`}>
          Unrelated CSS before the consumer
        </article>
        <article id="order-after" className={`${brand} fixture-card irrelevant-before order-after`}>
          Unrelated CSS after the consumer
        </article>
      </div>
      <button type="button" onClick={() => setRevision((current) => current + 1)}>Rerender fixture</button>
    </main>
  );
}
