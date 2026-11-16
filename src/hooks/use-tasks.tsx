"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TaskStatus } from "@/lib/domain-enums";
import type { Task } from "@/types/communications";

export interface TaskFilters {
  status?: TaskStatus;
  propertyId?: string;
}

export interface TaskInput {
  title: string;
  propertyId?: string;
  priority?: Task["priority"];
  status?: TaskStatus;
  assignedTo?: string;
  assignedToName?: string;
  dueDate: string;
  notes?: string;
}

export interface TaskUpdate {
  title?: string;
  priority?: Task["priority"];
  status?: TaskStatus;
  assignedTo?: string;
  assignedToName?: string;
  dueDate?: string;
  notes?: string;
  completedAt?: string;
}

export function useTasks(filters?: TaskFilters) {
  const [items, setItems] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: "100" });
    if (filters?.status) params.set("status", filters.status);
    if (filters?.propertyId) params.set("propertyId", filters.propertyId);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [filters?.status, filters?.propertyId]);

  useEffect(() => {
    let cancelled = false;
    void reload;
    const fetchItems = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/tasks${query}`);
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setItems(json.data ?? []);
          setError(null);
        } else {
          setError(json.error || "Failed to fetch tasks");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchItems();
    return () => {
      cancelled = true;
    };
  }, [query, reload]);

  const refetch = useCallback(() => setReload((n) => n + 1), []);

  return { items, loading, error, refetch };
}

export function useTaskMutations() {
  const [pending, setPending] = useState(false);

  const createTask = async (input: TaskInput): Promise<Task> => {
    setPending(true);
    try {
      const res = await fetch("/api/v1/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to create task");
      }
      return json.data as Task;
    } finally {
      setPending(false);
    }
  };

  const updateTask = async (id: string, input: TaskUpdate = {}): Promise<Task> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to update task");
      }
      return json.data as Task;
    } finally {
      setPending(false);
    }
  };

  const deleteTask = async (id: string): Promise<void> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/tasks/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to delete task");
      }
    } finally {
      setPending(false);
    }
  };

  return { createTask, updateTask, deleteTask, pending };
}
