import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { TailwindLandingPage } from "./TailwindLandingPage";
import { ConformancePage } from "./ConformancePage";
import { TailwindV3ConformancePage } from "./TailwindV3ConformancePage";
import { SprinklesConformancePage } from "./SprinklesConformancePage";
import { ExamplesPage } from "./ExamplesPage";
import "./styles.css";
import "./tailwind.css";

// Keep the generated spacing corpus behind a dev-only dynamic import. The
// fixture markup contains inspector identity attributes by design, so this
// route must not become part of the production runtime or bundle.
const DevSpacingConformancePage = import.meta.env.DEV
  ? lazy(() => import("./SpacingConformancePage").then(({ SpacingConformancePage }) => ({ default: SpacingConformancePage })))
  : null;
const DevTypographyConformancePage = import.meta.env.DEV
  ? lazy(() => import("./TypographyConformancePage").then(({ TypographyConformancePage }) => ({ default: TypographyConformancePage })))
  : null;
const DevColorConformancePage = import.meta.env.DEV
  ? lazy(() => import("./ColorConformancePage").then(({ ColorConformancePage }) => ({ default: ColorConformancePage })))
  : null;
const DevBorderConformancePage = import.meta.env.DEV
  ? lazy(() => import("./BorderConformancePage").then(({ BorderConformancePage }) => ({ default: BorderConformancePage })))
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
  if (import.meta.env.DEV && window.location.pathname === "/typography-conformance") {
    return DevTypographyConformancePage ? (
      <Suspense fallback={<main className="spacing-conformance-loading">Loading typography corpus…</main>}>
        <DevTypographyConformancePage />
      </Suspense>
    ) : <App />;
  }
  if (import.meta.env.DEV && window.location.pathname === "/color-conformance") {
    return DevColorConformancePage ? (
      <Suspense fallback={<main className="spacing-conformance-loading">Loading color corpus…</main>}>
        <DevColorConformancePage />
      </Suspense>
    ) : <App />;
  }
  if (import.meta.env.DEV && window.location.pathname === "/border-conformance") {
    return DevBorderConformancePage ? (
      <Suspense fallback={<main className="border-conformance-loading">Loading border corpus…</main>}>
        <DevBorderConformancePage />
      </Suspense>
    ) : <App />;
  }
  if (window.location.pathname === "/tailwind") return <TailwindLandingPage />;
  if (window.location.pathname === "/conformance") return <ConformancePage />;
  if (window.location.pathname === "/examples") return <ExamplesPage />;
  if (window.location.pathname === "/tailwind-v3") return <TailwindV3ConformancePage />;
  if (window.location.pathname === "/sprinkles") return <SprinklesConformancePage />;
  return <App />;
}

createRoot(root).render(<StrictMode><Route /></StrictMode>);
