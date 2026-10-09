import { createMirroredStorage, startPageInspector } from "nudge-ui/internal/page-inspector";
import { BOOT_GLOBAL, STORAGE_WRITE_EVENT, type ExtensionBoot, type StorageWrite } from "./protocol.ts";

const boot = (window as Window & { [BOOT_GLOBAL]?: ExtensionBoot })[BOOT_GLOBAL];

function persist(key: string, value: string | null): void {
  const write: StorageWrite = { key, value };
  // Event details cross the main/isolated world boundary only as primitives.
  document.dispatchEvent(new CustomEvent(STORAGE_WRITE_EVENT, { detail: JSON.stringify(write) }));
}

void startPageInspector({
  storage: boot ? createMirroredStorage(boot.storage, persist) : undefined,
  adoptStylesheets: true,
}).catch((error: unknown) => {
  console.error("[nudge-ui] Inspector failed to start.", error);
});
