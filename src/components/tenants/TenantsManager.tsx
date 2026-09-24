"use client";

import { Loader2, Plus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DashboardShell } from "@/components/DashboardShell";
import {
  AlertDialog,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { DashNavItem } from "@/config/dashboardNav";
import { useProperties } from "@/hooks/use-properties";
import {
  type Tenant,
  type TenantStatus,
  useTenantMutations,
  useTenants,
} from "@/hooks/use-tenants";
import { formatDate } from "@/lib/format";

type StatusFilter = "all" | TenantStatus;

interface TenantFormState {
  name: string;
  email: string;
  phone: string;
  propertyId: string;
  status: TenantStatus;
  notes: string;
}

const emptyForm: TenantFormState = {
  name: "",
  email: "",
  phone: "",
  propertyId: "",
  status: "pending",
  notes: "",
};

const statusClass: Record<TenantStatus, string> = {
  active: "bg-success/15 text-success",
  pending: "bg-warning/15 text-warning",
  rejected: "bg-destructive/15 text-destructive",
};

interface TenantsManagerProps {
  nav: DashNavItem[];
  roleName: string;
  canSetStatus: boolean;
  allowedProperties?: string[];
}

export const TenantsManager = ({
  nav,
  roleName,
  canSetStatus,
  allowedProperties,
}: TenantsManagerProps) => {
  const { tenants, loading, error, refetch } = useTenants();
  const { properties } = useProperties();
  const { createTenant, updateTenant, deleteTenant, pending } = useTenantMutations();

  const [tab, setTab] = useState<StatusFilter>("all");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [form, setForm] = useState<TenantFormState>(emptyForm);
  const [formErrors, setFormErrors] = useState<{
    name?: string;
    email?: string;
    propertyId?: string;
  }>({});
  const [deleting, setDeleting] = useState<Tenant | null>(null);

  const propertyOptions = useMemo(() => {
    if (!allowedProperties) return properties;
    return properties.filter((p) => allowedProperties.includes(p._id));
  }, [properties, allowedProperties]);

  const counts: Record<StatusFilter, number> = {
    all: tenants.length,
    pending: tenants.filter((t) => t.status === "pending").length,
    active: tenants.filter((t) => t.status === "active").length,
    rejected: tenants.filter((t) => t.status === "rejected").length,
  };

  const visible = useMemo(
    () =>
      tenants.filter(
        (t) =>
          (tab === "all" || t.status === tab) &&
          (propertyFilter === "all" || t.propertyId === propertyFilter),
      ),
    [tenants, tab, propertyFilter],
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, status: "pending" });
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEdit = (tenant: Tenant) => {
    setEditing(tenant);
    setForm({
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone ?? "",
      propertyId: tenant.propertyId ?? "",
      status: tenant.status,
      notes: tenant.notes ?? "",
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const validate = (): boolean => {
    const next: { name?: string; email?: string; propertyId?: string } = {};
    if (!form.name.trim()) next.name = "Name is required";
    if (!form.email.trim()) {
      next.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = "Enter a valid email";
    }
    if (!form.propertyId) next.propertyId = "Select a property";
    setFormErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    const input = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim() || undefined,
      propertyId: form.propertyId,
      notes: form.notes.trim() || undefined,
    };
    try {
      if (editing) {
        await updateTenant(editing._id, {
          ...input,
          ...(canSetStatus ? { status: form.status } : {}),
        });
        toast.success("Tenant updated", { description: `${input.name} was saved.` });
      } else {
        await createTenant({
          ...input,
          ...(canSetStatus ? { status: form.status } : {}),
        });
        toast.success("Tenant added", { description: `${input.name} was added.` });
      }
      setDialogOpen(false);
      refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.error(editing ? "Could not update tenant" : "Could not add tenant", {
        description: message,
      });
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteTenant(deleting._id);
      toast.success("Tenant removed", { description: `${deleting.name} was removed.` });
      setDeleting(null);
      refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete tenant";
      toast.error("Could not remove tenant", { description: message });
    }
  };

  return (
    <DashboardShell
      roleName={roleName}
      nav={nav}
      title="Tenants"
      subtitle="Manage the tenants across your properties."
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as StatusFilter)}>
          <TabsList>
            {(["all", "pending", "active", "rejected"] as const).map((t) => (
              <TabsTrigger key={t} value={t} className="capitalize">
                {t}
                <span className="ml-1.5 text-xs text-muted-foreground">{counts[t]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-3">
          <Select value={propertyFilter} onValueChange={setPropertyFilter}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="All properties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All properties</SelectItem>
              {propertyOptions.map((p) => (
                <SelectItem key={p._id} value={p._id}>
                  {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button className="rounded-full" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add tenant
          </Button>
        </div>
      </div>

      <div className="mt-6">
        {loading ? (
          <p className="text-muted-foreground">Loading tenants…</p>
        ) : error ? (
          <p className="text-destructive">{error}</p>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 font-display text-xl">No tenants in this view</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Adjust the filters or add a tenant to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((t) => {
                  const propertyTitle =
                    properties.find((p) => p._id === t.propertyId)?.title ?? t.propertyId;
                  return (
                    <TableRow key={t._id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-muted-foreground">{t.email}</TableCell>
                      <TableCell className="text-muted-foreground">{propertyTitle}</TableCell>
                      <TableCell>
                        <Badge className={`${statusClass[t.status]} capitalize hover:opacity-100`}>
                          {t.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(t.joinedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleting(t)}
                          >
                            Remove
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(next) => {
          if (!pending) setDialogOpen(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit tenant" : "Add tenant"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update the details of this tenant."
                : "Register a new tenant on one of your properties."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tenant-name">Name</Label>
              <Input
                id="tenant-name"
                placeholder="e.g. Amina Otieno"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tenant-email">Email</Label>
                <Input
                  id="tenant-email"
                  type="email"
                  placeholder="you@keja.co"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
                {formErrors.email && <p className="text-xs text-destructive">{formErrors.email}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="tenant-phone">Phone</Label>
                <Input
                  id="tenant-phone"
                  placeholder="+254 7xx xxx xxx"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Property</Label>
              <Select
                value={form.propertyId}
                onValueChange={(v) => setForm({ ...form, propertyId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select property" />
                </SelectTrigger>
                <SelectContent>
                  {propertyOptions.map((p) => (
                    <SelectItem key={p._id} value={p._id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.propertyId && (
                <p className="text-xs text-destructive">{formErrors.propertyId}</p>
              )}
            </div>
            {canSetStatus && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v as TenantStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="tenant-notes">Notes</Label>
              <Textarea
                id="tenant-notes"
                rows={2}
                placeholder="Optional notes about this tenant…"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={pending}
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button className="rounded-full" disabled={pending} onClick={handleSubmit}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Add tenant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!pending && !next) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.name ?? "this tenant"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the tenant from your records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={pending} onClick={handleDelete}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Remove tenant
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardShell>
  );
};
