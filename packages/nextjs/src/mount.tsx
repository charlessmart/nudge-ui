"use client";

import { useEffect } from "react";

/**
 * Adds the development-only shared inspector client to a Next.js document.
 *
 * Next compiles this small host component with the application. The inspector
 * UI and its private React graph remain in the external client served by the
 * sidecar, while transformed application components register the host React
 * Adapter through the page-global runtime seam.
 */
export function NudgeUiMount(): null {
  useEffect(() => {
    // The module script and inspector mount intentionally live for the page
    // lifetime. Removing them during a React Strict Mode cleanup would strand
    // the already-evaluated module when the effect runs again.
    if (document.querySelector("script[data-nudge-ui-client]")) return;
    const script = document.createElement("script");
    script.type = "module";
    script.src = "/__nudge_ui__/client.mjs";
    script.dataset.nudgeUiClient = "";
    script.dataset.nudgeUiManifest = "/__nudge_ui__/manifest";
    script.onerror = () => {
      console.warn("[nudge-ui] inspector bootstrap failed to load.");
    };
    document.body.appendChild(script);
  }, []);

  return null;
}
