import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { tokenCatalog, tokenDiagnostics, tokens } from "virtual:design-tokens";
import { TailwindLandingPage } from "./TailwindLandingPage";
import { ExamplesTailwindV4Page } from "./ExamplesTailwindV4Page";
import "./tailwind.css";

const DevShadcnComponentsPage = import.meta.env.DEV
  ? lazy(() => import("./ShadcnComponentsPage").then(({ ShadcnComponentsPage }) => ({ default: ShadcnComponentsPage })))
  : null;

if (import.meta.env.DEV) {
  window.__designTokens = tokens;
  window.__designTokenCatalog = tokenCatalog;
  window.__designTokenDiagnostics = tokenDiagnostics;
}

function Route() {
  if (import.meta.env.DEV && window.location.pathname === "/components") {
    return DevShadcnComponentsPage ? <Suspense fallback={<main className="min-h-screen bg-background p-10">Loading components…</main>}><DevShadcnComponentsPage /></Suspense> : <TailwindLandingPage />;
  }
  if (window.location.pathname === "/examples") return <ExamplesTailwindV4Page />;
  return <TailwindLandingPage />;
}

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
createRoot(root).render(<StrictMode><Route /></StrictMode>);
