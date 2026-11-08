"use client";

import { useEffect } from "react";
import { mountComponentSheet, type MountComponentSheetOptions } from "../../componentSheet/sheet.tsx";

export type NextComponentSheetProps = Omit<MountComponentSheetOptions, "componentId" | "container">;

const HOST_ATTRIBUTE = "data-nudge-ui-sheet-host";
const HIDE_ATTRIBUTE = "data-nudge-ui-sheet-layout";

/**
 * The sheet renders inside the application's root layout, which keeps its global CSS, fonts and body classes.
 * The layout's own chrome is hidden, and the sheet mounts in its own root under `<body>` as it does on Vite.
 */
export function NextComponentSheet({ contracts, loaders, sheetWrapper }: NextComponentSheetProps) {
  // Each field comes from the generated module, so identities change only when that module is rewritten.
  useEffect(() => {
    const host = document.createElement("div");
    host.setAttribute(HOST_ATTRIBUTE, "");
    document.body.append(host);
    const hide = document.createElement("style");
    hide.setAttribute("data-nudge-ui", HIDE_ATTRIBUTE);
    // The inspector root, scripts and the Next.js dev overlay stay; every other child of the layout's body is chrome.
    hide.textContent = `body > :not([${HOST_ATTRIBUTE}]):not(#nudge-ui-root):not(script):not(style):not(link):not(nextjs-portal) { display: none !important; }`;
    document.head.append(hide);
    const unmount = mountComponentSheet({
      contracts,
      loaders,
      ...(sheetWrapper ? { sheetWrapper } : {}),
      container: host,
      componentId: new URLSearchParams(window.location.search).get("component"),
    });
    return () => {
      // Cleanup runs while the page's own root commits; unmounting the sheet's root synchronously there is a race React warns about.
      setTimeout(unmount, 0);
      host.remove();
      hide.remove();
    };
  }, [contracts, loaders, sheetWrapper]);
  return null;
}
