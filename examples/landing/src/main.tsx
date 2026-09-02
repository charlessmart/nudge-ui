import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { DemoPage } from "./DemoPage";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

const params = new URLSearchParams(window.location.search);
const demoEnabled = params.get("nudgeDemo") === "1";
const page = window.location.pathname === "/demo"
  ? <DemoPage enabled={demoEnabled} />
  : <App />;

if (demoEnabled && !import.meta.env.DEV) {
  const inspectorRoot = document.createElement("div");
  inspectorRoot.id = "nudge-ui-root";
  document.body.appendChild(inspectorRoot);
  void import("virtual:nudge-ui-inspector");
}

createRoot(root).render(<StrictMode>{page}</StrictMode>);
