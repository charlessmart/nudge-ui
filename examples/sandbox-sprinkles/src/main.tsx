import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { tokenCatalog, tokenDiagnostics, tokens } from "virtual:design-tokens";
import "./order-before.css";
import { App } from "./App.tsx";
import "./order-after.css";
import "./app.css";
import { ExamplesSprinklesPage } from "./ExamplesSprinklesPage";
import { sprinkles } from "./sprinkles.css.ts";

if (import.meta.env.DEV) {
  const debugWindow = window as unknown as Record<string, unknown>;
  debugWindow.__designTokens = tokens;
  debugWindow.__designTokenCatalog = tokenCatalog;
  debugWindow.__designTokenDiagnostics = tokenDiagnostics;
}

function SprinklesConformancePage() {
  return (
    <main className="compat-page">
      <h1>Sprinkles conformance</h1>
      <p data-test="sprinkles-card" className={sprinkles({ color: "brand", padding: "md" })}>Human-readable theme contract mapping</p>
      <p data-test="sprinkles-raw" className={sprinkles({ padding: "sm" })}>Real generated class output remains inspectable.</p>
    </main>
  );
}

function Route() {
  if (window.location.pathname === "/examples") return <ExamplesSprinklesPage />;
  if (window.location.pathname === "/sprinkles") return <SprinklesConformancePage />;
  return <App />;
}

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
createRoot(root).render(<StrictMode><Route /></StrictMode>);
