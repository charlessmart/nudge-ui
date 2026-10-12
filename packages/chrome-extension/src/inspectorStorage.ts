import { createMirroredStorage, type InspectorStorage } from "nudge-ui/internal/page-inspector";
import { STORAGE_READ_EVENT, STORAGE_READ_RESPONSE_EVENT, STORAGE_WRITE_EVENT, type StorageReadResponse } from "./protocol.ts";

/** Reloads saved state under the workspace lease; writes remain synchronous to callers. */
export function createExtensionInspectorStorage(initial: Record<string, string>): InspectorStorage {
  let nextId = 0;
  const read = (): Promise<Record<string, string>> => new Promise((resolve, reject) => {
    const id = ++nextId;
    const finish = (): void => {
      clearTimeout(timeout);
      document.removeEventListener(STORAGE_READ_RESPONSE_EVENT, onResponse);
    };
    const onResponse = (event: Event): void => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (typeof detail !== "string") return;
      let response: StorageReadResponse;
      try {
        response = JSON.parse(detail) as StorageReadResponse;
      } catch {
        return;
      }
      if (response.id !== id) return;
      finish();
      if (response.values) resolve(response.values);
      else reject(new Error(response.error ?? "Inspector storage could not be read."));
    };
    const timeout = setTimeout(() => {
      finish();
      reject(new Error("Inspector storage did not respond."));
    }, 5000);
    document.addEventListener(STORAGE_READ_RESPONSE_EVENT, onResponse);
    document.dispatchEvent(new CustomEvent(STORAGE_READ_EVENT, { detail: id }));
  });
  return createMirroredStorage(initial, (key, value) => {
    document.dispatchEvent(new CustomEvent(STORAGE_WRITE_EVENT, { detail: JSON.stringify({ key, value }) }));
  }, read);
}
