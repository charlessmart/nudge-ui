import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { EasterEggPage } from "./EasterEggPage";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

const params = new URLSearchParams(window.location.search);
const demoEnabled = params.get("nudgeDemo") === "1";
const landingDemoBuild = import.meta.env.MODE === "nudge-demo";
const editorDocument = (import.meta.env.DEV || landingDemoBuild)
  && params.getAll("nudge-ui").includes("editor");
const directApplication = params.get("__nudge_ui_direct") === "1";
const demoControllerDocument = !directApplication
  && window.self === window.top
  && (landingDemoBuild || (import.meta.env.DEV && window.location.pathname === "/"));
const page = params.get("nudge-egg") === "1"
  ? <EasterEggPage />
  : window.location.pathname === "/demo"
  ? demoEnabled || landingDemoBuild
    ? <App />
    : (
      <main className="demo-disabled">
        <p className="demo-eyebrow">Nudge UI demo</p>
        <h1>This route needs the explicit demo flag.</h1>
        <p>Open <code>/demo?nudgeDemo=1</code> to mount the inspector.</p>
      </main>
    )
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
