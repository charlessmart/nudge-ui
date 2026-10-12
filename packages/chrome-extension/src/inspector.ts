import { startCanvasRenderer, startPageInspector } from "nudge-ui/internal/page-inspector";
import {
  BOOT_GLOBAL,
  RENDERER_FRAME_LOAD_EVENT,
  type ExtensionBoot,
} from "./protocol.ts";
import { createExtensionSketchStorage } from "./sketchStorage.ts";
import { createExtensionInspectorStorage } from "./inspectorStorage.ts";

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
      storage: createExtensionInspectorStorage(boot.storage),
      sketchStorage: createExtensionSketchStorage(),
      adoptStylesheets: true,
      surface: boot.surface,
      ...(boot.unavailableReason ? { unavailableReason: boot.unavailableReason } : {}),
      onRendererFrameLoad: () => document.dispatchEvent(new CustomEvent(RENDERER_FRAME_LOAD_EVENT)),
    }).catch((error: unknown) => {
      console.error("[nudge-ui] Inspector failed to start.", error);
    });
  }
} else {
  startCanvasRenderer({ adoptStylesheets: true });
}
