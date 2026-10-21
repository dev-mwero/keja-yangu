"use client";

import { FileStack, FileText, FileUser, SearchX } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { SearchInput } from "@/components/SearchInput";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { useCaretakerNav } from "@/hooks/use-caretaker-nav";
import { useDocuments } from "@/hooks/use-documents";
import { useProperties } from "@/hooks/use-properties";
import { useTenants } from "@/hooks/use-tenants";
import { formatDate } from "@/lib/format";
import { matchesQuery } from "@/lib/search";

const CaretakerDocumentsPage = () => {
  const nav = useCaretakerNav();
  const { user } = useAuth();
  const { properties } = useProperties();
  const { tenants, loading: tenantsLoading } = useTenants();
  const { items, loading: documentsLoading } = useDocuments();
  const [query, setQuery] = useState("");

  const allowedPropertyIds = useMemo(
    () =>
      new Set(properties.filter((p) => p.caretakerIds.includes(user?.id ?? "")).map((p) => p._id)),
    [properties, user?.id],
  );

  const scopedTenants = useMemo(
    () => tenants.filter((t) => allowedPropertyIds.has(t.propertyId)),
    [tenants, allowedPropertyIds],
  );

  const documentsByTenant = useMemo(() => {
    const map = new Map<string, number>();
    for (const doc of items) {
      if (doc.tenantId) map.set(doc.tenantId, (map.get(doc.tenantId) ?? 0) + 1);
    }
    return map;
  }, [items]);

  const visibleTenants = scopedTenants.filter((t) =>
    matchesQuery(query, t.name, t.email, t.unit?.name),
  );

  const withDocuments = scopedTenants.filter((t) => (documentsByTenant.get(t._id) ?? 0) > 0).length;
  const withoutDocuments = scopedTenants.length - withDocuments;

  const loading = tenantsLoading || documentsLoading;

  return (
    <DashboardShell
      roleName="Caretaker"
      nav={nav}
      title="Tenant documents"
      subtitle="Check that every tenant has their paperwork on file."
    >
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <StatCard label="Tenants" value={loading ? "…" : scopedTenants.length} icon={FileUser} />
        <StatCard label="With documents" value={loading ? "…" : withDocuments} icon={FileStack} />
        <StatCard
          label="Missing documents"
          value={loading ? "…" : withoutDocuments}
          icon={SearchX}
          hint="No files on record"
        />
        <StatCard label="Total documents" value={loading ? "…" : items.length} icon={FileText} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search tenants…"
          className="w-full sm:w-64"
        />
        <Button asChild variant="outline" className="rounded-full">
          <Link href="/dashboard/caretaker/tenants">Manage tenants</Link>
        </Button>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Documents</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  Loading tenants…
                </TableCell>
              </TableRow>
            ) : visibleTenants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  <FileUser className="mx-auto mb-2 h-6 w-6 opacity-50" />
                  {scopedTenants.length === 0
                    ? "No tenants are assigned to your properties yet."
                    : "No tenants match your search."}
                </TableCell>
              </TableRow>
            ) : (
              visibleTenants.map((tenant) => {
                const count = documentsByTenant.get(tenant._id) ?? 0;
                return (
                  <TableRow key={tenant._id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 font-display font-semibold text-primary">
                          {tenant.name.slice(0, 1)}
                        </div>
                        <div>
                          <p className="font-medium">{tenant.name}</p>
                          <p className="text-xs text-muted-foreground">{tenant.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {tenant.unit?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {tenant.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {count > 0 ? (
                        <Badge className="bg-success/15 text-success hover:opacity-100">
                          {count} on file
                        </Badge>
                      ) : (
                        <Badge className="bg-destructive/15 text-destructive hover:opacity-100">
                          Missing
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {!loading && items.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Last document added {formatDate(items[0].uploadedAt)} · {items.length} documents across{" "}
          {withDocuments} tenants.
        </p>
      )}
    </DashboardShell>
  );
};

export default CaretakerDocumentsPage;
