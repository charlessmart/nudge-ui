import React from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceButton } from "@acme/ui";

function App() {
  return (
    <main>
      <h1>Packed Vite React workspace consumer</h1>
      <WorkspaceButton />
    </main>
  );
}

createRoot(document.getElementById("app")).render(<App />);
