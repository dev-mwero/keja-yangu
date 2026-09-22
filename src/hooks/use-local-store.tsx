"use client";

import { useCallback, useEffect, useState } from "react";
import type { LocalStore } from "@/lib/local-store";

export function useLocalStore<T extends { id: string }>(store: LocalStore<T>) {
  const [items, setItems] = useState<T[]>([]);

  const refresh = useCallback(() => setItems(store.readAll()), [store]);

  useEffect(() => {
    refresh();
    return store.subscribe(refresh);
  }, [refresh, store]);

  const addItem = useCallback(
    (item: T) => {
      store.addItem(item);
      refresh();
    },
    [store, refresh],
  );

  const updateItem = useCallback(
    (id: string, patch: Partial<T> | ((item: T) => T)) => {
      const next = store.updateItem(id, patch);
      if (next) refresh();
      return next;
    },
    [store, refresh],
  );

  const removeItem = useCallback(
    (id: string) => {
      const removed = store.removeItem(id);
      if (removed) refresh();
      return removed;
    },
    [store, refresh],
  );

  return {
    items,
    setItems,
    addItem,
    updateItem,
    removeItem,
    refresh,
  };
}
