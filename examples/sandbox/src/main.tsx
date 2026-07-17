import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { TailwindLandingPage } from "./TailwindLandingPage";
import { ConformancePage } from "./ConformancePage";
import { TailwindV3ConformancePage } from "./TailwindV3ConformancePage";
import { SprinklesConformancePage } from "./SprinklesConformancePage";
import "./styles.css";
import "./tailwind.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    {window.location.pathname === "/tailwind" ? <TailwindLandingPage /> : window.location.pathname === "/conformance" ? <ConformancePage /> : window.location.pathname === "/tailwind-v3" ? <TailwindV3ConformancePage /> : window.location.pathname === "/sprinkles" ? <SprinklesConformancePage /> : <App />}
  </StrictMode>,
);
