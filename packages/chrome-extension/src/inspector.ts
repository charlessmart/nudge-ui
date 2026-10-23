import { startPageInspector } from "nudge-ui/internal/page-inspector";
import { BOOT_GLOBAL, type ExtensionBoot } from "./protocol.ts";
import { createExtensionSketchStorage } from "./sketchStorage.ts";
import { createExtensionInspectorStorage } from "./inspectorStorage.ts";
import { createExtensionSystemFonts } from "./systemFonts.ts";
import { installPanelDock } from "./panelDock.ts";

function takeBoot(): ExtensionBoot | undefined {
  const scope = window as Window & { [BOOT_GLOBAL]?: ExtensionBoot };
  const boot = scope[BOOT_GLOBAL];
  delete scope[BOOT_GLOBAL];
  return boot;
}

const boot = takeBoot();
if (boot) {
  installPanelDock(boot.panelSide ?? "right");
  void startPageInspector({
    storage: createExtensionInspectorStorage(boot.storage),
    sketchStorage: createExtensionSketchStorage(),
    systemFonts: createExtensionSystemFonts(boot.systemFontsAllowed === true),
    adoptStylesheets: true,
  }).catch((error: unknown) => {
    console.error("[nudge-ui] Inspector failed to start.", error);
  });
}
