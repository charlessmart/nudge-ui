import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { LandingVersionPage, type LandingVersion } from "./LandingVersionPage";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

const params = new URLSearchParams(window.location.search);
const landingDemoBuild = import.meta.env.MODE === "nudge-demo";
const editorDocument = (import.meta.env.DEV || landingDemoBuild)
  && params.getAll("nudge-ui").includes("editor");
const directApplication = params.get("__nudge_ui_direct") === "1";
const demoControllerDocument = !directApplication
  && window.self === window.top
  && (landingDemoBuild || (import.meta.env.DEV && window.location.pathname === "/"));
const landingVersion = params.get("landing-version");
const page = landingVersion === "1" || landingVersion === "2"
  ? <LandingVersionPage version={landingVersion as LandingVersion} />
  : <App />;

if (landingDemoBuild && !import.meta.env.DEV) {
  const inspectorRoot = document.createElement("div");
  inspectorRoot.id = "nudge-ui-root";
  document.body.appendChild(inspectorRoot);
  void import("virtual:nudge-ui-inspector");
}

if (!editorDocument && !demoControllerDocument) {
  createRoot(root).render(<StrictMode>{page}</StrictMode>);
}
