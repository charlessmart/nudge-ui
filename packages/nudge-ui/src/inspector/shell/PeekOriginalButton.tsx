import { useEffect, useSyncExternalStore, type ReactElement } from "react";
import { IconButton } from "../ui/IconButton.tsx";
import { PeekOriginalIcon } from "./PeekOriginalIcon.tsx";
import { workspaceChangeStore } from "../changes/workspaceChanges.ts";
import {
  setOriginalPreviewActive,
  useOriginalPreviewActive,
} from "./originalPreview.ts";

function useWorkspaceChangeCount(): number {
  return useSyncExternalStore(
    workspaceChangeStore.subscribe,
    () => {
      const snapshot = workspaceChangeStore.getSnapshot();
      return snapshot.changes.length + snapshot.structuralChanges.length;
    },
    () => 0,
  );
}

/**
 * Press-and-hold button that previews the page without inspector changes
 * (NUD-30). Releasing restores the edited preview; canonical intent is never
 * cleared, so nothing is lost while held.
 */
export function PeekOriginalButton(): ReactElement {
  const active = useOriginalPreviewActive();
  const changeCount = useWorkspaceChangeCount();
  const disabled = changeCount === 0;

  useEffect(() => {
    if (!active) return;
    const release = (): void => setOriginalPreviewActive(false);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
  }, [active]);

  useEffect(() => () => {
    setOriginalPreviewActive(false);
  }, []);

  return (
    <IconButton
      variant="quiet"
      data-test="peek-original-button"
      label="Hold to view original"
      title={disabled ? "No changes to preview" : "Hold to view original"}
      aria-pressed={active}
      data-active={active ? "true" : "false"}
      disabled={disabled}
      onPointerDown={(event) => {
        if (disabled) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setOriginalPreviewActive(true);
      }}
      onPointerUp={() => setOriginalPreviewActive(false)}
      onPointerCancel={() => setOriginalPreviewActive(false)}
      onLostPointerCapture={() => setOriginalPreviewActive(false)}
      onKeyDown={(event) => {
        if (disabled || event.repeat) return;
        if (event.key === " " || event.key === "Enter") setOriginalPreviewActive(true);
      }}
      onKeyUp={(event) => {
        if (event.key === " " || event.key === "Enter") setOriginalPreviewActive(false);
      }}
      onBlur={() => setOriginalPreviewActive(false)}
      onContextMenu={(event) => {
        if (active) event.preventDefault();
      }}
    >
      <PeekOriginalIcon />
    </IconButton>
  );
}
