import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { TailwindLandingPage } from "./TailwindLandingPage";
import "./styles.css";
import "./tailwind.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    {window.location.pathname === "/tailwind" ? <TailwindLandingPage /> : <App />}
  </StrictMode>,
);
