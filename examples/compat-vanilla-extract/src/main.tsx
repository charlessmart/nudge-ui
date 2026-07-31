import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./order-before.css";
import { App } from "./App.tsx";
import "./order-after.css";
import "./app.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
createRoot(root).render(<StrictMode><App /></StrictMode>);
