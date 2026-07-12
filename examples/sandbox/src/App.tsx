import { useEffect, useState } from "react";
import { Button } from "./Button";
import { Footer } from "./Footer";
import { RepeatedItem } from "./RepeatedItem";
import { tokenCatalog, tokens } from "virtual:design-tokens";

if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __designTokens?: unknown }).__designTokens = tokens;
  (window as unknown as { __designTokenCatalog?: unknown }).__designTokenCatalog = tokenCatalog;
}

export function App() {
  const [clicks, setClicks] = useState(0);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __designToolRerender?: () => void }).__designToolRerender = () =>
      setClicks((c) => c + 1);
    return () => {
      delete (window as unknown as { __designToolRerender?: () => void }).__designToolRerender;
    };
  }, []);
  return (
    <div>
      <header className="header">
        <h1>Design Tool Sandbox</h1>
        <p className="subtitle">Edit tokens live in dev.</p>
        <p data-test="click-counter">clicks: {clicks}</p>
      </header>
      <main className="content">
        <Button
          label="Save"
          variant="primary"
          onClick={() => setClicks((c) => c + 1)}
        />
        <div data-test="repeated-items">
          {Array.from({ length: 6 }, (_, index) => (
            <RepeatedItem key={index} label={`Repeated ${index + 1}`} />
          ))}
        </div>
        <div className="flex-row" data-test="flex-container">
          <span data-test="flex-child-a">A</span>
          <span data-test="flex-child-b">B</span>
          <span data-test="flex-child-c">C</span>
        </div>
        <div className="positioned-box" data-test="positioned-box">
          positioned
        </div>
      </main>
      <Footer />
      {import.meta.env.DEV ? (
        <section data-test="tokens">
          <h2>Design tokens ({tokens.length})</h2>
          <ul>
            {tokens.map((t) => (
              <li key={t.name} data-token-name={t.name}>
                {t.name}: {t.value}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
