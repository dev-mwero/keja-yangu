export interface LocalStore<T extends { id: string }> {
  readAll(): T[];
  writeAll(items: T[]): void;
  addItem(item: T): void;
  updateItem(id: string, patch: Partial<T> | ((item: T) => T)): T | undefined;
  removeItem(id: string): boolean;
  subscribe(cb: () => void): () => void;
}

export function createLocalStore<T extends { id: string }>(
  key: string,
  seed: () => T[] = () => [],
): LocalStore<T> {
  const storageKey = `keja-store:${key}`;
  const eventKey = `keja-store:${key}:changed`;

  const readAll = (): T[] => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return seed();
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : seed();
    } catch {
      return seed();
    }
  };

  const writeAll = (items: T[]) => {
    localStorage.setItem(storageKey, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(eventKey));
  };

  return {
    readAll,
    writeAll,
    addItem(item) {
      writeAll([...readAll(), item]);
    },
    updateItem(id, patch) {
      const all = readAll();
      const index = all.findIndex((item) => item.id === id);
      if (index === -1) return undefined;
      const merged = typeof patch === "function" ? patch(all[index]) : { ...all[index], ...patch };
      all[index] = merged;
      writeAll(all);
      return merged;
    },
    removeItem(id) {
      const all = readAll();
      const next = all.filter((item) => item.id !== id);
      if (next.length === all.length) return false;
      writeAll(next);
      return true;
    },
    subscribe(cb) {
      const onChange = () => cb();
      const onStorage = (event: StorageEvent) => {
        if (event.key === storageKey) cb();
      };
      window.addEventListener(eventKey, onChange);
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener(eventKey, onChange);
        window.removeEventListener("storage", onStorage);
      };
    },
  };
}
