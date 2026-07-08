import { Button } from "./Button";
import { Footer } from "./Footer";
import { tokens } from "virtual:design-tokens";

if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __designTokens?: unknown }).__designTokens = tokens;
}

export function App() {
  return (
    <div>
      <header className="header">
        <h1>Design Tool Sandbox</h1>
        <p className="subtitle">Edit tokens live in dev.</p>
      </header>
      <main className="content">
        <Button
          label="Save"
          variant="primary"
          onClick={() => undefined}
        />
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