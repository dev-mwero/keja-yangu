"use client";

import {
  Bath,
  BedDouble,
  Building2,
  CheckCircle2,
  Clock,
  MapPin,
  Pencil,
  Plus,
  Ruler,
  Trash2,
  Wrench,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { DashboardShell } from "@/components/DashboardShell";
import { DeletePropertyDialog } from "@/components/dialogs/DeletePropertyDialog";
import { PropertyDialog } from "@/components/dialogs/PropertyDialog";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useCaretakerNav } from "@/hooks/use-caretaker-nav";
import { type Property, useProperties } from "@/hooks/use-properties";
import { formatKES } from "@/lib/format";

const statusClass: Record<string, string> = {
  available: "bg-success/15 text-success",
  occupied: "bg-primary/15 text-primary",
  maintenance: "bg-warning/15 text-warning",
};

const statusLabel: Record<string, string> = {
  available: "Vacant",
  occupied: "Occupied",
  maintenance: "Maintenance",
};

const CaretakerPortfolioPage = () => {
  const nav = useCaretakerNav();
  const { user } = useAuth();
  const { properties, loading, error, refetch } = useProperties();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);
  const [deleting, setDeleting] = useState<Property | null>(null);

  const selfId = user?.id ?? "";
  const canCreate = user?.privileges?.includes("create_property") ?? false;
  const canEdit = user?.privileges?.includes("edit_property") ?? false;
  const canDelete = user?.privileges?.includes("delete_assigned_property") ?? false;

  const mine = properties.filter((p) => p.caretakerIds.includes(selfId));

  const occupied = mine.filter((p) => p.status === "occupied").length;
  const vacant = mine.filter((p) => p.status === "available").length;
  const maintenance = mine.filter((p) => p.status === "maintenance").length;

  const handleEdit = (property: Property) => {
    const ownerApproved = property.ownerId === (user?.managedByOwnerId ?? "");
    if (!ownerApproved) {
      toast.error("You can only edit properties owned by the landlord you manage for.");
      return;
    }
    setEditing(property);
  };

  const handleDelete = (property: Property) => {
    const ownerApproved = property.ownerId === (user?.managedByOwnerId ?? "");
    if (!ownerApproved) {
      toast.error("You can only delete properties owned by the landlord you manage for.");
      return;
    }
    setDeleting(property);
  };

  return (
    <DashboardShell
      roleName="Caretaker"
      nav={nav}
      title="My portfolio"
      subtitle="Every property under your care at a glance."
    >
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Assigned" value={loading ? "…" : mine.length} icon={Building2} />
        <StatCard label="Occupied" value={occupied} icon={CheckCircle2} />
        <StatCard label="Vacant" value={vacant} icon={Clock} />
        <StatCard label="Maintenance" value={maintenance} icon={Wrench} />
      </div>

      {canCreate && (
        <div className="mt-8 flex justify-end">
          <Button className="rounded-full" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Add property
          </Button>
        </div>
      )}

      <div className="mt-8">
        {loading ? (
          <p className="text-muted-foreground">Loading properties…</p>
        ) : error ? (
          <p className="text-destructive">{error}</p>
        ) : mine.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
            <Building2 className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 font-display text-xl">No properties assigned yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              The landlord will assign properties to you from the portfolio.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {mine.map((p) => {
              const showEdit = canEdit;
              const showDelete = canDelete && p.caretakerIds.includes(selfId);
              const showActions = showEdit || showDelete;
              return (
                <div key={p._id} className="relative">
                  <Link href={`/properties/${p._id}`} className="group block">
                    <div className="h-full overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-all hover:shadow-elevated">
                      <div className="relative h-40">
                        <Image
                          src={p.images[0] ?? "/images/property-1.jpg"}
                          alt={p.title}
                          fill
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                          <span className="rounded-full bg-background/90 px-3 py-1 text-xs font-medium">
                            {formatKES(p.price)}/mo
                          </span>
                          <Badge
                            className={`${statusClass[p.status]} capitalize hover:opacity-100`}
                          >
                            {statusLabel[p.status]}
                          </Badge>
                        </div>
                      </div>
                      <div className="p-5">
                        <h3 className="font-display text-lg font-semibold group-hover:underline">
                          {p.title}
                        </h3>
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" />
                          {p.location}
                        </p>
                        <div className="mt-4 flex items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <BedDouble className="h-3.5 w-3.5" />
                            {p.beds} bd
                          </span>
                          <span className="flex items-center gap-1">
                            <Bath className="h-3.5 w-3.5" />
                            {p.baths} ba
                          </span>
                          <span className="flex items-center gap-1">
                            <Ruler className="h-3.5 w-3.5" />
                            {p.area} m²
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                  {showActions && (
                    <div className="absolute right-4 top-4 z-10 flex gap-2">
                      {showEdit && (
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-8 w-8 rounded-full shadow-soft"
                          aria-label={`Edit ${p.title}`}
                          onClick={() => handleEdit(p)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {showDelete && (
                        <Button
                          size="icon"
                          variant="destructive"
                          className="h-8 w-8 rounded-full shadow-soft"
                          aria-label={`Delete ${p.title}`}
                          onClick={() => handleDelete(p)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <PropertyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        allowCaretakerIds={false}
        onSuccess={refetch}
      />

      <PropertyDialog
        open={editing !== null}
        onOpenChange={(next) => {
          if (!next) setEditing(null);
        }}
        mode="edit"
        property={editing}
        allowCaretakerIds={false}
        onSuccess={refetch}
      />

      <DeletePropertyDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null);
        }}
        property={deleting}
        onDeleted={refetch}
      />
    </DashboardShell>
  );
};

export default CaretakerPortfolioPage;
