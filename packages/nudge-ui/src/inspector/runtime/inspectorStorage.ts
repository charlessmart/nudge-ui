export interface InspectorStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** Reloads an asynchronous backend under the lease, before controller hydration. */
  refresh?(): Promise<void>;
}

let configured: InspectorStorage | null = null;

export function configureInspectorStorage(storage: InspectorStorage | null): void {
  configured = storage;
}

export function inspectorStorage(): InspectorStorage | null {
  if (configured) return configured;
  return typeof localStorage === "undefined" ? null : localStorage;
}

/** Keeps an asynchronous backend behind the synchronous interface callers expect. */
export function createMirroredStorage(
  initial: Readonly<Record<string, string>>,
  persist: (key: string, value: string | null) => void,
  read?: () => Promise<Readonly<Record<string, string>>>,
): InspectorStorage {
  const values = new Map(Object.entries(initial));
  let refreshId = 0;
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) {
      values.set(key, value);
      persist(key, value);
    },
    removeItem(key) {
      if (!values.delete(key)) return;
      persist(key, null);
    },
    ...(read ? {
      async refresh() {
        const id = ++refreshId;
        const snapshot = await read();
        if (id !== refreshId) return;
        values.clear();
        for (const [key, value] of Object.entries(snapshot)) values.set(key, value);
      },
    } : {}),
  };
}
