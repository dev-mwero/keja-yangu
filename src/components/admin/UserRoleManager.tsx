"use client";

import { ShieldCheck, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SearchInput } from "@/components/SearchInput";
import { StatCard } from "@/components/StatCard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { type UserRow, useUserRolePromotion, useUsers } from "@/hooks/use-users";
import { matchesQuery } from "@/lib/search";

const FILTER_ROLES: UserRow["role"][] = [
  "tenant",
  "caretaker",
  "custodian",
  "admin",
  "broker",
  "system-admin",
];

/**
 * Roles assignable from the dashboard. `system-admin` is intentionally absent:
 * it is granted/revoked only through the audited CLI (scripts/grant-system-admin.ts).
 */
const ASSIGNABLE_ROLES: UserRow["role"][] = ["tenant", "caretaker", "custodian", "admin", "broker"];

export const UserRoleManager = ({ refreshKey = 0 }: { refreshKey?: number }) => {
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const filters = useMemo(
    () => ({
      role: roleFilter === "all" ? undefined : roleFilter,
      active: activeFilter === "all" ? undefined : activeFilter === "active",
      search: search || undefined,
      page,
      limit: 20,
    }),
    [roleFilter, activeFilter, search, page],
  );

  const { users, pagination, loading, error, refetch } = useUsers(filters);

  // Re-fetch when the parent signals a new user was created.
  useEffect(() => {
    if (refreshKey > 0) refetch();
  }, [refreshKey, refetch]);
  const { promoteUserRole, pending, pendingId } = useUserRolePromotion();

  const [confirmTarget, setConfirmTarget] = useState<{
    user: UserRow;
    role: UserRow["role"];
  } | null>(null);

  const visible = users.filter((u) => matchesQuery(search, u.name, u.email, u.phone, u.role));

  const requestChange = (u: UserRow, nextRole: UserRow["role"]) => {
    if (nextRole === u.role) return;
    setConfirmTarget({ user: u, role: nextRole });
  };

  const handleConfirm = async () => {
    if (!confirmTarget) return;
    const target = confirmTarget;
    try {
      await promoteUserRole(target.user.id, target.role);
      toast.success(`${target.user.name}'s role updated to ${target.role}`);
      setConfirmTarget(null);
      refetch();
    } catch (err) {
      toast.error("Could not update role", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const isDisabledMessage = !!error && /disabled|unavailable|not found|404|503/i.test(error);

  return (
    <div className="space-y-4">
      <div className="mb-2 grid gap-4 sm:max-w-xs">
        <StatCard
          label="Users"
          value={loading ? "…" : (pagination?.total ?? users.length)}
          icon={Users}
          hint="Platform accounts"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-lg">Users & Roles</h3>
          <p className="text-sm text-muted-foreground">
            Promote or change a user's role. System-admin accounts are managed via the audited CLI.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {FILTER_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={activeFilter} onValueChange={setActiveFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search users…"
            className="w-full sm:w-56"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading users…</p>
      ) : error ? (
        <p className="text-destructive">{isDisabledMessage ? "Role management disabled" : error}</p>
      ) : users.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <Users className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <h3 className="font-display text-xl">No users found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Adjust your filters to see more accounts.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Change role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No users match your search.
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((u) => {
                  const isSelf = currentUser?.id === u.id;
                  const busy = pending && pendingId === u.id;
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-wrap items-center gap-2">
                          {u.name || "—"}
                          {isSelf && (
                            <Badge variant="outline" className="text-[10px]">
                              You
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{u.email ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{u.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.isActive ? "default" : "outline"}>
                          {u.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {u.role === "system-admin" ? (
                          <Badge variant="outline" className="text-[10px]">
                            CLI-managed
                          </Badge>
                        ) : (
                          <Select
                            value={u.role}
                            onValueChange={(v) => requestChange(u, v as UserRow["role"])}
                            disabled={isSelf || pending}
                          >
                            <SelectTrigger className="w-[150px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ASSIGNABLE_ROLES.map((r) => (
                                <SelectItem key={r} value={r}>
                                  {r}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {busy && <ShieldCheck className="ml-2 inline h-4 w-4 animate-pulse" />}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border p-4 sm:px-6">
              <span className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={!pagination.hasPrevPage}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={!pagination.hasNextPage}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <AlertDialog
        open={!!confirmTarget}
        onOpenChange={(open) => {
          if (!pending && !open) setConfirmTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change user role?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget
                ? `Change ${confirmTarget.user.name} from ${confirmTarget.user.role} to ${confirmTarget.role}?`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={handleConfirm}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
