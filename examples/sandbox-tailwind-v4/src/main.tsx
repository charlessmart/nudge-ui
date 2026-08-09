import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { tokenCatalog, tokenDiagnostics, tokens } from "virtual:design-tokens";
import { TailwindLandingPage } from "./TailwindLandingPage";
import { ExamplesTailwindV4Page } from "./ExamplesTailwindV4Page";
import "./tailwind.css";

if (import.meta.env.DEV) {
  const debugWindow = window as unknown as Record<string, unknown>;
  debugWindow.__designTokens = tokens;
  debugWindow.__designTokenCatalog = tokenCatalog;
  debugWindow.__designTokenDiagnostics = tokenDiagnostics;
}

function Route() {
  if (window.location.pathname === "/examples") return <ExamplesTailwindV4Page />;
  return <TailwindLandingPage />;
}

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
createRoot(root).render(<StrictMode><Route /></StrictMode>);

