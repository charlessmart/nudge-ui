import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, OPEN_NUDGE_EVENT } from "./App";
import { LandingVersionPage } from "./LandingVersionPage";
import { HeroVariantsPage } from "./hero/HeroVariantsPage";
import { LayoutVariantsPage } from "./layouts/LayoutVariantsPage";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

const params = new URLSearchParams(window.location.search);
const landingDemoBuild = import.meta.env.MODE === "nudge-demo";
// The editor document only hosts the inspector; every other document, including the top-level landing page, renders the app (ADR-0049).
const editorDocument = (import.meta.env.DEV || landingDemoBuild)
  && window.self === window.top
  && params.get("__nudge_ui_direct") !== "1"
  && params.getAll("nudge-ui").includes("editor");
const landingVersion = params.get("landing-version");
const heroRoute = window.location.pathname.match(/^\/hero(?:\/([a-z0-9-]+))?\/?$/);
const layoutsRoute = window.location.pathname.match(/^\/layouts(?:\/([a-z0-9-]+))?\/?$/);
const page = heroRoute
  ? <HeroVariantsPage slug={heroRoute[1] ?? null} />
  : layoutsRoute
    ? <LayoutVariantsPage slug={layoutsRoute[1] ?? null} />
    : landingVersion === "1" || landingVersion === "2"
      ? <LandingVersionPage version={landingVersion} />
      : <App />;

// Design explorations are not content: keep them out of the index and off the home page's canonical.
if (heroRoute || layoutsRoute) {
  document.querySelector('link[rel="canonical"]')?.remove();
  const robots = document.createElement("meta");
  robots.name = "robots";
  robots.content = "noindex";
  document.head.append(robots);
}

if (landingDemoBuild && !import.meta.env.DEV) {
  const inspectorRoot = document.createElement("div");
  inspectorRoot.id = "nudge-ui-root";
  document.body.appendChild(inspectorRoot);
  const loadInspector = () => import("virtual:nudge-ui-inspector");
  if (editorDocument || window.self !== window.top) {
    // The editor and its Canvas frames need the inspector from the first paint.
    void loadInspector();
  } else {
    // The plain page only needs it once a visitor opens Nudge; the open action then runs from the loaded module.
    window.addEventListener(OPEN_NUDGE_EVENT, () => {
      void loadInspector().then(() => window.dispatchEvent(new Event(OPEN_NUDGE_EVENT)));
    }, { once: true });
  }
}

if (!editorDocument) {
  createRoot(root).render(<StrictMode>{page}</StrictMode>);
}
