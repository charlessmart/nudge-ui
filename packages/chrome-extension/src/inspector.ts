import { createMirroredStorage, startCanvasRenderer, startPageInspector } from "nudge-ui/internal/page-inspector";
import {
  BOOT_GLOBAL,
  RENDERER_FRAME_LOAD_EVENT,
  STORAGE_WRITE_EVENT,
  type ExtensionBoot,
  type StorageWrite,
} from "./protocol.ts";

function persist(key: string, value: string | null): void {
  const write: StorageWrite = { key, value };
  // Event details cross the main/isolated world boundary only as primitives.
  document.dispatchEvent(new CustomEvent(STORAGE_WRITE_EVENT, { detail: JSON.stringify(write) }));
}

function takeBoot(): ExtensionBoot | undefined {
  const scope = window as Window & { [BOOT_GLOBAL]?: ExtensionBoot };
  const boot = scope[BOOT_GLOBAL];
  delete scope[BOOT_GLOBAL];
  return boot;
}

if (window === window.top) {
  const boot = takeBoot();
  if (boot) {
    void startPageInspector({
      storage: createMirroredStorage(boot.storage, persist),
      adoptStylesheets: true,
      surface: boot.surface,
      onRendererFrameLoad: () => document.dispatchEvent(new CustomEvent(RENDERER_FRAME_LOAD_EVENT)),
    }).catch((error: unknown) => {
      console.error("[nudge-ui] Inspector failed to start.", error);
    });
  }
} else {
  startCanvasRenderer({ adoptStylesheets: true });
}
