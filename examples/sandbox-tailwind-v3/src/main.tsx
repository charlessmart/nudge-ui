import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { tokenCatalog, tokenDiagnostics, tokens } from "virtual:design-tokens";
import { ExamplesTailwindV3Page } from "./ExamplesTailwindV3Page";
import { TailwindV3ComponentsPage } from "./TailwindV3ComponentsPage";
import { TailwindV3ConformancePage } from "./TailwindV3ConformancePage";
import "./app.css";

if (import.meta.env.DEV) {
  window.__designTokens = tokens;
  window.__designTokenCatalog = tokenCatalog;
  window.__designTokenDiagnostics = tokenDiagnostics;
}

function Route() {
  if (window.location.pathname === "/components") return <TailwindV3ComponentsPage />;
  if (window.location.pathname === "/examples") return <ExamplesTailwindV3Page />;
  return <TailwindV3ConformancePage />;
}

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
createRoot(root).render(<StrictMode><Route /></StrictMode>);
