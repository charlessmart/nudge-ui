import { createRoot } from "react-dom/client";
import { configureInspectorStorage } from "@inspector/runtime/inspectorStorage.ts";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig } from "@inspector/runtime/runtimeConfig.ts";
import { componentContracts } from "virtual:nudge-ui-components";
import { Workbench } from "./Workbench.tsx";
import "virtual:workbench-styles";
import "./workbench.css";

// Source imports own fixture state; the normal bundled client owns the editing session.
const storage = new Map<string, string>();
configureInspectorStorage({
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => { storage.set(key, value); },
  removeItem: (key) => { storage.delete(key); },
});
configureNudgeUiRuntime({ ...getNudgeUiRuntimeConfig(), projectId: "inspector-workbench-fixtures", componentContracts });

const root = document.getElementById("root");
if (!root) throw new Error("Workbench root is missing.");
createRoot(root).render(<Workbench />);
