import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { TailwindLandingPage } from "./TailwindLandingPage";
import { ConformancePage } from "./ConformancePage";
import "./styles.css";
import "./tailwind.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    {window.location.pathname === "/tailwind" ? <TailwindLandingPage /> : window.location.pathname === "/conformance" ? <ConformancePage /> : <App />}
  </StrictMode>,
);
