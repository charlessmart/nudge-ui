import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { TailwindLandingPage } from "./TailwindLandingPage";
import { ConformancePage } from "./ConformancePage";
import { TailwindV3ConformancePage } from "./TailwindV3ConformancePage";
import { SprinklesConformancePage } from "./SprinklesConformancePage";
import "./styles.css";
import "./tailwind.css";

// Keep the generated spacing corpus behind a dev-only dynamic import. The
// fixture markup contains inspector identity attributes by design, so this
// route must not become part of the production runtime or bundle.
const DevSpacingConformancePage = import.meta.env.DEV
  ? lazy(() => import("./SpacingConformancePage").then(({ SpacingConformancePage }) => ({ default: SpacingConformancePage })))
  : null;

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

function Route() {
  if (window.location.pathname === "/spacing-conformance") {
    return DevSpacingConformancePage ? (
      <Suspense fallback={<main className="spacing-conformance-loading">Loading spacing corpus…</main>}>
        <DevSpacingConformancePage />
      </Suspense>
    ) : <App />;
  }
  if (window.location.pathname === "/tailwind") return <TailwindLandingPage />;
  if (window.location.pathname === "/conformance") return <ConformancePage />;
  if (window.location.pathname === "/tailwind-v3") return <TailwindV3ConformancePage />;
  if (window.location.pathname === "/sprinkles") return <SprinklesConformancePage />;
  return <App />;
}

createRoot(root).render(<StrictMode><Route /></StrictMode>);
