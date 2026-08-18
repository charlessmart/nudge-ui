import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { tokenCatalog, tokenDiagnostics, tokens } from "virtual:design-tokens";
import "./order-before.css";
import { App } from "./App.tsx";
import "./order-after.css";
import "./app.css";
import { ExamplesSprinklesPage } from "./ExamplesSprinklesPage";
import { sprinkles } from "./sprinkles.css.ts";

const DevSprinklesComponentsPage = import.meta.env.DEV
  ? lazy(() => import("./ExamplesSprinklesComponentsPage").then(({ ExamplesSprinklesComponentsPage }) => ({ default: ExamplesSprinklesComponentsPage })))
  : null;

if (import.meta.env.DEV) {
  window.__designTokens = tokens;
  window.__designTokenCatalog = tokenCatalog;
  window.__designTokenDiagnostics = tokenDiagnostics;
}

function SprinklesConformancePage() {
  const cardIdentity = import.meta.env.DEV ? { "data-test": "sprinkles-card" } : {};
  const rawIdentity = import.meta.env.DEV ? { "data-test": "sprinkles-raw" } : {};
  return (
    <main className="compat-page">
      <h1>Sprinkles conformance</h1>
      <p {...cardIdentity} className={sprinkles({ color: "brand", padding: "md" })}>Human-readable theme contract mapping</p>
      <p {...rawIdentity} className={sprinkles({ padding: "sm" })}>Real generated class output remains inspectable.</p>
    </main>
  );
}

function Route() {
  if (import.meta.env.DEV && window.location.pathname === "/components") {
    return DevSprinklesComponentsPage ? <Suspense fallback={<main className="compat-page">Loading components…</main>}><DevSprinklesComponentsPage /></Suspense> : <App />;
  }
  if (window.location.pathname === "/examples") return <ExamplesSprinklesPage />;
  if (window.location.pathname === "/sprinkles") return <SprinklesConformancePage />;
  return <App />;
}

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
createRoot(root).render(<StrictMode><Route /></StrictMode>);
