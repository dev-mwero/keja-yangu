"use client";

import { ShieldCheck, UserCog, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SearchInput } from "@/components/SearchInput";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type CustodianRow, useCustodianMutations, useCustodians } from "@/hooks/use-custodians";
import { matchesQuery } from "@/lib/search";

export const CustodianManager = () => {
  const { custodians, loading, error, refetch } = useCustodians();
  const { updateCustodianPrivileges, revokeCustodian, pending } = useCustodianMutations();
  const [query, setQuery] = useState("");

  const visible = custodians.filter((c) => matchesQuery(query, c.name, c.email, c.phone));

  const togglePrivileged = async (c: CustodianRow, checked: boolean) => {
    const next = checked ? ["assign_privileges"] : [];
    try {
      await updateCustodianPrivileges(c.id, next);
      toast.success(
        checked
          ? `${c.name} can now assign caretaker privileges`
          : `${c.name} is no longer privileged`,
      );
      refetch();
    } catch (err) {
      toast.error("Could not update custodian", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const revoke = async (id: string, custodianName: string) => {
    try {
      await revokeCustodian(id);
      toast.success(`${custodianName}'s access revoked`);
      refetch();
    } catch (err) {
      toast.error("Could not revoke custodian", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="mb-2 grid gap-4 sm:max-w-xs">
        <StatCard
          label="Custodians"
          value={loading ? "…" : custodians.length}
          icon={Users}
          hint="Managing your portfolio"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-lg">Custodians</h3>
          <p className="text-sm text-muted-foreground">
            Custodians manage your portfolio on your behalf, scoped to your account.
          </p>
        </div>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search custodians…"
          className="w-full sm:w-56"
        />
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading custodians…</p>
      ) : error ? (
        <p className="text-destructive">{error}</p>
      ) : custodians.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <UserCog className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <h3 className="font-display text-xl">No custodians yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Invite a custodian to help manage your portfolio.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Privileges</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No custodians match your search.
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-wrap items-center gap-2">
                        {c.name}
                        {c.privileges.includes("assign_privileges") && (
                          <Badge variant="secondary" className="gap-1 text-[10px]">
                            <ShieldCheck className="h-3 w-3" />
                            Privileged
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.phone || "—"}</TableCell>
                    <TableCell>
                      <Switch
                        aria-label={`Assign privileges for ${c.name}`}
                        checked={c.privileges.includes("assign_privileges")}
                        disabled={pending}
                        onCheckedChange={(checked) => togglePrivileged(c, checked)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        disabled={pending}
                        onClick={() => revoke(c.id, c.name)}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
