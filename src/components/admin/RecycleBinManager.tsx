"use client";

import { Archive, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { StatCard } from "@/components/StatCard";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type RecycleBinRecord,
  useRecycleBinCounts,
  useRecycleBinMutations,
  useRecycleBinRecords,
} from "@/hooks/use-recycle-bin";
import { formatDateTime } from "@/lib/format";
import {
  RECYCLE_BIN_TYPE_LABELS,
  RECYCLE_BIN_TYPES,
  type RecycleBinType,
} from "@/lib/recycle-bin-types";

/** A short human label for a heterogeneous deleted record. */
function describeRecord(type: RecycleBinType, record: RecycleBinRecord): string {
  const text = (key: string): string => {
    const value = record[key];
    return typeof value === "string" ? value.trim() : "";
  };

  switch (type) {
    case "property":
      return text("title") || `Property ${record._id}`;
    case "unit":
      return text("name") || `Unit ${record._id}`;
    case "tenant":
      return text("name") || text("email") || `Tenant ${record._id}`;
    case "lease":
      return text("tenantId") ? `Lease for tenant ${text("tenantId")}` : `Lease ${record._id}`;
    case "invoice":
      return text("invoiceNumber") || `Invoice ${record._id}`;
    case "propertytype":
      return text("label") || text("key") || `Type ${record._id}`;
    default:
      return record._id;
  }
}

export const RecycleBinManager = () => {
  const [activeType, setActiveType] = useState<RecycleBinType>("property");
  const [page, setPage] = useState(1);
  const [purgeTarget, setPurgeTarget] = useState<RecycleBinRecord | null>(null);

  const { counts, loading: countsLoading, refetch: refetchCounts } = useRecycleBinCounts();
  const { records, pagination, loading, error, refetch } = useRecycleBinRecords(activeType, page);
  const { restore, purge, pendingId } = useRecycleBinMutations();

  const switchType = (next: RecycleBinType) => {
    setActiveType(next);
    setPage(1);
  };

  const handleRestore = async (record: RecycleBinRecord) => {
    try {
      await restore(activeType, record._id);
      toast.success("Record restored");
      refetch();
      refetchCounts();
    } catch (err) {
      toast.error("Could not restore record", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handlePurge = async () => {
    if (!purgeTarget) return;
    const target = purgeTarget;
    try {
      await purge(activeType, target._id);
      toast.success("Record permanently deleted");
      setPurgeTarget(null);
      // Stepping back a page refetches; otherwise refresh in place.
      if (records.length === 1 && page > 1) {
        setPage((current) => Math.max(1, current - 1));
      } else {
        refetch();
      }
      refetchCounts();
    } catch (err) {
      toast.error("Could not delete record", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Total deleted"
          value={countsLoading ? "…" : Object.values(counts).reduce((sum, n) => sum + n, 0)}
          icon={Archive}
        />
        <StatCard
          label="Properties"
          value={countsLoading ? "…" : (counts.property ?? 0)}
          icon={Trash2}
        />
        <StatCard label="Units" value={countsLoading ? "…" : (counts.unit ?? 0)} icon={Trash2} />
        <StatCard
          label="Tenants"
          value={countsLoading ? "…" : (counts.tenant ?? 0)}
          icon={Trash2}
        />
      </div>

      <Tabs value={activeType} onValueChange={(value) => switchType(value as RecycleBinType)}>
        <TabsList className="flex h-auto flex-wrap gap-1 bg-muted p-1">
          {RECYCLE_BIN_TYPES.map((type) => {
            const count = counts[type] ?? 0;
            return (
              <TabsTrigger key={type} value={type} className="gap-2">
                {RECYCLE_BIN_TYPE_LABELS[type]}
                <Badge variant={count > 0 ? "default" : "outline"} className="text-xs">
                  {count}
                </Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <div className="rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border p-6">
          <h3 className="font-display text-lg font-semibold">
            Deleted {RECYCLE_BIN_TYPE_LABELS[activeType].toLowerCase()}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Restore a record to bring it back, or delete it permanently.
          </p>
        </div>

        <div className="divide-y divide-border">
          {loading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading records…
            </div>
          ) : error ? (
            <p className="p-6 text-sm text-destructive">{error}</p>
          ) : records.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Nothing has been deleted here.</p>
          ) : (
            records.map((record) => {
              const busy = pendingId === record._id;
              return (
                <div
                  key={record._id}
                  className="flex flex-wrap items-center justify-between gap-4 p-4 sm:px-6"
                >
                  <div className="min-w-[180px] flex-1">
                    <p className="font-medium">{describeRecord(activeType, record)}</p>
                    <p className="text-xs text-muted-foreground">
                      Deleted {formatDateTime(record.deletedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full"
                      disabled={busy}
                      onClick={() => handleRestore(record)}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" /> Restore
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full text-destructive hover:text-destructive"
                      disabled={busy}
                      onClick={() => setPurgeTarget(record)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

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
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={!pagination.hasNextPage}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <AlertDialog
        open={!!purgeTarget}
        onOpenChange={(open) => {
          if (!pendingId && !open) setPurgeTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              {purgeTarget ? describeRecord(activeType, purgeTarget) : "This record"} will be
              removed for good. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!pendingId}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={!!pendingId} onClick={handlePurge}>
              {pendingId && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete permanently
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
