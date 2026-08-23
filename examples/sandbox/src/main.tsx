import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ConformancePage } from "./ConformancePage";
import { ExamplesHubPage } from "./ExamplesHubPage";
import { ExamplesRawCssPage } from "./ExamplesRawCssPage";
import "./styles.css";

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
const DevPipelineConformancePage = import.meta.env.DEV
  ? lazy(() => import("./PipelineConformancePage").then(({ PipelineConformancePage }) => ({ default: PipelineConformancePage })))
  : null;
const DevPerfFixturePage = import.meta.env.DEV
  ? lazy(() => import("./perf-fixture/PerfFixturePage").then(({ PerfFixturePage }) => ({ default: PerfFixturePage })))
  : null;
const DevComponentPropsPage = import.meta.env.DEV
  ? lazy(() => import("./ComponentPropsPage").then(({ ComponentPropsPage }) => ({ default: ComponentPropsPage })))
  : null;
// Dev-only fixture surface: the previous landing-page demo corpus (repeated
// items, flex lab, conformance links, token table) that the Playwright suite
// drives the inspector against. The public landing route renders the
// Penpot "Landing V6 — Mono" design instead.
const DevPlaygroundPage = import.meta.env.DEV
  ? lazy(() => import("./playground/PlaygroundPage").then(({ PlaygroundPage }) => ({ default: PlaygroundPage })))
  : null;
const DevRawCssComponentsPage = import.meta.env.DEV
  ? lazy(() => import("./ExamplesRawCssComponentsPage").then(({ ExamplesRawCssComponentsPage }) => ({ default: ExamplesRawCssComponentsPage })))
  : null;

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

function Route() {
  if (import.meta.env.DEV && window.location.pathname === "/playground") {
    return DevPlaygroundPage ? (
      <Suspense fallback={<main className="spacing-conformance-loading">Loading playground…</main>}>
        <DevPlaygroundPage />
      </Suspense>
    ) : <App />;
  }
  if (import.meta.env.DEV && window.location.pathname === "/components") {
    return DevRawCssComponentsPage ? <DevRawCssComponentsPage /> : <App />;
  }
  if (import.meta.env.DEV && window.location.search.includes("perf=large")) {
    return DevPerfFixturePage ? (
      <Suspense fallback={<main className="spacing-conformance-loading">Loading perf fixture…</main>}>
        <DevPerfFixturePage />
      </Suspense>
    ) : <App />;
  }
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
  if (import.meta.env.DEV && window.location.pathname === "/pipeline-conformance") {
    return DevPipelineConformancePage ? (
      <Suspense fallback={<main className="spacing-conformance-loading">Loading pipeline corpus…</main>}>
        <DevPipelineConformancePage />
      </Suspense>
    ) : <App />;
  }
  if (window.location.pathname === "/conformance") return <ConformancePage />;
  if (window.location.pathname === "/examples") return <ExamplesHubPage />;
  if (window.location.pathname === "/examples/raw-css") return <ExamplesRawCssPage />;
  if (window.location.pathname === "/component-props") {
    return DevComponentPropsPage ? (
      <Suspense fallback={<main className="component-props-page">Loading component props…</main>}>
        <DevComponentPropsPage />
      </Suspense>
    ) : <App />;
  }
  return <App />;
}

createRoot(root).render(<StrictMode><Route /></StrictMode>);
