"use client";

import { Download, FileUser, Search, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tenants } from "@/data/properties";
import { useCaretakerNav } from "@/hooks/use-caretaker-nav";
import { formatKES } from "@/lib/format";

const docs: Record<string, { label: string; present: boolean }[]> = {
  t1: [
    { label: "Lease agreement", present: true },
    { label: "National ID", present: true },
    { label: "Guarantor form", present: true },
    { label: "Deposit receipt", present: true },
  ],
  t2: [
    { label: "Lease agreement", present: true },
    { label: "National ID", present: true },
    { label: "Guarantor form", present: false },
    { label: "Deposit receipt", present: false },
  ],
  t3: [
    { label: "Lease agreement", present: true },
    { label: "National ID", present: true },
    { label: "Guarantor form", present: true },
    { label: "Deposit receipt", present: true },
  ],
  t4: [
    { label: "Lease agreement", present: false },
    { label: "National ID", present: true },
    { label: "Guarantor form", present: false },
    { label: "Deposit receipt", present: false },
  ],
  t5: [
    { label: "Lease agreement", present: false },
    { label: "National ID", present: true },
    { label: "Guarantor form", present: false },
    { label: "Deposit receipt", present: false },
  ],
};

const CaretakerDocumentsPage = () => {
  const nav = useCaretakerNav();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter(
      (t) => t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q),
    );
  }, [query]);

  const upload = () =>
    toast.info("Documents shared", {
      description: "Documents have been shared with the landlord.",
    });

  const requestDoc = (name: string) =>
    toast.info("Reminder sent", { description: `A reminder was emailed to ${name}.` });

  return (
    <DashboardShell
      roleName="Caretaker"
      nav={nav}
      title="Tenant documents"
      subtitle="Check that every tenant has their paperwork on file."
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tenants…"
            className="w-64 pl-9"
          />
        </div>
        <Button variant="outline" className="rounded-full" onClick={upload}>
          <Upload className="h-4 w-4" />
          Bulk upload
        </Button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center md:col-span-2">
            <FileUser className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 font-display text-xl">No tenants found</h3>
            <p className="mt-1 text-sm text-muted-foreground">Try a different search.</p>
          </div>
        ) : (
          filtered.map((tenant) => {
            const checklist = docs[tenant.id] ?? [];
            const complete = checklist.filter((d) => d.present).length;
            return (
              <div
                key={tenant.id}
                className="rounded-2xl border border-border bg-card p-5 shadow-soft"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 font-display font-semibold text-primary">
                      {tenant.name.slice(0, 1)}
                    </div>
                    <div>
                      <p className="font-medium">{tenant.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {tenant.email}
                        {tenant.propertyId ? ` · ${tenant.status}` : " · No unit assigned"}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {complete}/{checklist.length} on file
                  </Badge>
                </div>
                <ul className="mt-4 space-y-2 border-t border-border pt-4">
                  {checklist.map((d) => (
                    <li key={d.label} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{d.label}</span>
                      <Badge
                        className={
                          d.present
                            ? "bg-success/15 text-success hover:opacity-100"
                            : "bg-destructive/15 text-destructive hover:opacity-100"
                        }
                      >
                        {d.present ? "On file" : "Missing"}
                      </Badge>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 rounded-full"
                    onClick={() => requestDoc(tenant.name)}
                  >
                    <Download className="h-4 w-4" />
                    Request docs
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 rounded-full text-muted-foreground"
                    onClick={upload}
                  >
                    <Upload className="h-4 w-4" />
                    Upload
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-dashed border-border bg-card/50 p-4 text-center text-sm text-muted-foreground">
        Deposit amounts are tracked by the landlord in Accounting. Invoices use {formatKES(45000)}–
        {formatKES(120000)} per unit.
      </div>
    </DashboardShell>
  );
};

export default CaretakerDocumentsPage;
