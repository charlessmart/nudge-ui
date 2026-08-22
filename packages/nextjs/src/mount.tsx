"use client";

import { useEffect } from "react";

/**
 * Dev-only inspector bootstrap for the Next.js host Adapter (ADR-0010).
 *
 * The Stage 2 layout loader appends this component as the last child of the
 * rendered `<html>`. It renders `null` everywhere. The inspector is imported
 * dynamically inside the effect: `"use client"` components are still
 * evaluated on the server for SSR, and the shared inspector runtime touches
 * browser globals at module scope. Lazy import keeps that evaluation
 * browser-only while Next compiles it into the client bundle.
 *
 * Because the dynamic module is compiled by Next's own compiler inside the
 * host application, `@design-tool/inspector` resolves the app's React
 * instance naturally — ADR-0004's single-React-instance goal through module
 * resolution instead of Vite aliasing.
 */
export function DesignToolMount(): null {
  useEffect(() => {
    let disposed = false;
    let unsubscribeReload: (() => void) | undefined;

    const root = document.createElement("div");
    root.id = "design-tool-root";
    document.body.appendChild(root);

    async function activate(): Promise<void> {
      const inspector = await import("@design-tool/inspector");
      if (disposed) return;

      inspector.setDesignToolHostDevFlag(true);
      const response = await fetch("/__design_tool__/manifest", { cache: "no-store" });
      if (!response.ok) throw new Error(`manifest request failed: ${response.status}`);
      const manifest = await response.json();
      inspector.configureDesignToolRuntime(manifest as Parameters<typeof inspector.configureDesignToolRuntime>[0]);
      inspector.bootstrapDesignTool(root);

      // Token and component knowledge refresh in place; the inspector owns
      // snapshot replacement, so a reconfigure is safe after bootstrapping.
      // The sidecar announces the current revision on subscribe and then one
      // frame per settled batch; revisions already reflected by the snapshot
      // fetched above are deduplicated against Next's own refreshes.
      let seenRevision: number | null = null;
      let refreshInFlight = false;
      const source = new EventSource("/__design_tool__/reload");
      source.onmessage = (event: MessageEvent<string>) => {
        const revision = Number((JSON.parse(event.data) as { revision?: number }).revision);
        if (Number.isNaN(revision)) return;
        if (seenRevision === null) {
          // First frame announces the generation the snapshot was taken at.
          seenRevision = revision;
          return;
        }
        if (revision === seenRevision || refreshInFlight) return;
        seenRevision = revision;
        refreshInFlight = true;
        void fetch("/__design_tool__/manifest", { cache: "no-store" })
          .then((refreshed) => refreshed.json())
          .then((refreshedManifest) => {
            if (!disposed) {
              inspector.configureDesignToolRuntime(
                refreshedManifest as Parameters<typeof inspector.configureDesignToolRuntime>[0],
              );
            }
          })
          .catch(() => {
            // A failed refresh keeps the last good snapshot; the next
            // revision retries.
          })
          .finally(() => {
            refreshInFlight = false;
          });
      };
      unsubscribeReload = () => source.close();
    }

    void activate().catch((error: unknown) => {
      console.warn("[design-tool] inspector bootstrap failed:", error);
    });

    return () => {
      disposed = true;
      unsubscribeReload?.();
      root.remove();
    };
  }, []);

  return null;
}
