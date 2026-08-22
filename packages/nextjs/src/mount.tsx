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
 *
 * Revision reconciliation: the manifest carries its own revision and every
 * SSE frame announces one. A frame newer than the snapshot we hold triggers
 * a refetch; frames arriving DURING a refetch are never dropped — the newest
 * observed revision wins and a trailing fetch reconciles anything the
 * in-flight request missed.
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

      const initial = await fetch("/__design_tool__/manifest", { cache: "no-store" }).then(
        (response) => response.json(),
      );
      if (disposed) return;
      inspector.configureDesignToolRuntime(
        initial as Parameters<typeof inspector.configureDesignToolRuntime>[0],
      );
      inspector.bootstrapDesignTool(root);

      let seenRevision = Number((initial as { revision?: number }).revision ?? 0);
      let latestObserved = seenRevision;
      let refreshInFlight = false;

      async function reconcile(): Promise<void> {
        const refreshed = await fetch("/__design_tool__/manifest", { cache: "no-store" }).then(
          (response) => response.json(),
        );
        if (!disposed) {
          inspector.configureDesignToolRuntime(
            refreshed as Parameters<typeof inspector.configureDesignToolRuntime>[0],
          );
        }
        seenRevision = Math.max(
          seenRevision,
          Number((refreshed as { revision?: number }).revision ?? seenRevision),
        );
      }

      const source = new EventSource("/__design_tool__/reload");
      source.onmessage = (event: MessageEvent<string>) => {
        const revision = Number((JSON.parse(event.data) as { revision?: number }).revision);
        if (Number.isNaN(revision)) return;
        latestObserved = Math.max(latestObserved, revision);
        if (refreshInFlight || latestObserved <= seenRevision) return;
        refreshInFlight = true;
        void reconcile()
          .catch(() => {
            // A failed refresh keeps the last good snapshot; the next
            // revision retries.
          })
          .finally(() => {
            refreshInFlight = false;
            // A frame landing mid-refetch must not be lost.
            if (latestObserved > seenRevision) void reconcile();
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
