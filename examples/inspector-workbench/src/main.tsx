// This example is a development tool, not a published inspector bundle.
if (import.meta.env.DEV) {
  void import("./mountWorkbench.tsx");
} else {
  const root = document.getElementById("root");
  if (root) root.textContent = "Run pnpm dev:workbench to open the inspector workbench.";
}

export {};
