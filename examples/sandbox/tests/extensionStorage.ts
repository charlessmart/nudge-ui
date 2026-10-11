import type { Page } from "@playwright/test";

/** Provides an extension backend that survives page reloads and can be shared by tabs. */
export async function installExtensionStorage(
  page: Page,
  stored = new Map<string, unknown>(),
  beforeReadResponse?: () => Promise<void>,
): Promise<Map<string, unknown>> {
  await page.exposeFunction("__extensionStorage", async (op: string, payload: unknown) => {
    if (op === "getKeys") return [...stored.keys()];
    if (op === "get") {
      const snapshot = Object.fromEntries((payload as string[]).filter((key) => stored.has(key)).map((key) => [key, stored.get(key)]));
      await beforeReadResponse?.();
      return snapshot;
    }
    if (op === "set") Object.entries(payload as Record<string, unknown>).forEach(([key, value]) => stored.set(key, value));
    if (op === "remove") (Array.isArray(payload) ? payload as string[] : [payload as string]).forEach((key) => stored.delete(key));
    return null;
  });
  await page.addInitScript(() => {
    const call = (window as unknown as { __extensionStorage(op: string, payload?: unknown): Promise<unknown> }).__extensionStorage;
    Object.assign(window, {
      chrome: {
        storage: {
          local: {
            getKeys: () => call("getKeys"),
            get: (keys: string[]) => call("get", keys),
            set: (items: Record<string, unknown>) => call("set", items),
            remove: (keys: string | string[]) => call("remove", keys),
          },
        },
        runtime: { sendMessage: async () => undefined },
      },
    });
  });
  return stored;
}
