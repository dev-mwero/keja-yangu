"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type UserRole = "tenant" | "caretaker" | "custodian" | "admin" | "broker" | "system-admin";

export interface UserRow {
  id: string;
  _id?: string;
  name: string;
  email?: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;
  privileges?: string[];
}

export interface UserFilters {
  role?: string;
  active?: boolean;
  search?: string;
  q?: string;
  query?: string;
  page?: number;
  limit?: number;
  enabled?: boolean;
}

export interface UserPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

function normalizeUser(raw: unknown): UserRow {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = String(r.id ?? r._id ?? "");
  return {
    id,
    _id: r._id != null ? String(r._id) : id,
    name: String(r.name ?? ""),
    email: r.email != null ? String(r.email) : undefined,
    phone: r.phone != null ? String(r.phone) : undefined,
    role: (r.role as UserRole) ?? "tenant",
    isActive: r.isActive !== false,
    privileges: Array.isArray(r.privileges) ? (r.privileges as string[]) : [],
  };
}

type UseUsersArgs = [
  filters?: UserFilters | string | boolean | null,
  pageOrOptions?: number | { page?: number; limit?: number; enabled?: boolean } | undefined,
  limitArg?: number,
  optionsArg?: { enabled?: boolean },
];

function parseUsersArgs(args: UseUsersArgs): {
  filters: UserFilters;
  enabled: boolean;
} {
  let filters: UserFilters = {};
  let enabled = true;

  const first = args[0];
  if (first && typeof first === "object") {
    filters = { ...(first as UserFilters) };
  } else if (typeof first === "string") {
    filters.role = first;
  } else if (typeof first === "boolean") {
    filters.active = first;
  }

  const second = args[1];
  if (typeof second === "number") {
    filters.page = second;
  } else if (second && typeof second === "object") {
    if (second.page != null) filters.page = second.page;
    if (second.limit != null) filters.limit = second.limit;
    if (second.enabled != null) enabled = second.enabled;
  }

  if (typeof args[2] === "number") {
    filters.limit = args[2];
  }

  if (args[3]?.enabled != null) {
    enabled = args[3].enabled as boolean;
  }

  if (filters.enabled != null) {
    enabled = filters.enabled;
    delete filters.enabled;
  }

  return { filters, enabled };
}

export function useUsers(...args: UseUsersArgs) {
  const { filters, enabled } = parseUsersArgs(args);

  const role = filters.role;
  const active = filters.active;
  const search = filters.search ?? filters.q ?? filters.query;
  const page = filters.page;
  const limit = filters.limit;

  const [users, setUsers] = useState<UserRow[]>([]);
  const [pagination, setPagination] = useState<UserPagination | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (role) params.set("role", role);
    if (active !== undefined && active !== null) params.set("active", String(active));
    if (search) params.set("search", search);
    if (page != null) params.set("page", String(page));
    if (limit != null) params.set("limit", String(limit));
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [role, active, search, page, limit]);

  useEffect(() => {
    let cancelled = false;
    void reload;
    const fetchUsers = async () => {
      if (!enabled) {
        setUsers([]);
        setLoading(false);
        setError(null);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/admin/users${query}`);
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          const data = Array.isArray(json.data) ? json.data : json.data ? [json.data] : [];
          setUsers(data.map(normalizeUser));
          setPagination((json.pagination as UserPagination) ?? null);
          setTotal(
            (json.pagination as UserPagination)?.total ??
              (Array.isArray(json.data) ? json.data.length : data.length),
          );
          setError(null);
        } else {
          setError(json.error || "Failed to fetch users");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchUsers();
    return () => {
      cancelled = true;
    };
  }, [query, reload, enabled]);

  const refetch = useCallback(() => setReload((n) => n + 1), []);

  return { users, data: users, records: users, pagination, total, loading, error, refetch };
}

export function useUserRolePromotion() {
  const [pending, setPending] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const promote = useCallback(async (id: string, role: string): Promise<UserRow> => {
    setPending(true);
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = json.error || "Failed to update user role";
        setError(message);
        throw new Error(message);
      }
      return normalizeUser(json.data ?? json);
    } finally {
      setPending(false);
      setPendingId(null);
    }
  }, []);

  return {
    promoteUserRole: promote,
    promoteUser: promote,
    promote,
    updateRole: promote,
    patchRole: promote,
    mutate: promote,
    pending,
    pendingId,
    error,
  };
}

export const useUserMutations = useUserRolePromotion;
export const useUpdateUserRole = useUserRolePromotion;
export const usePromoteUserRole = useUserRolePromotion;
