"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type CaretakerRow,
  useCaretakers,
  useUpdateCaretakerPrivileges,
} from "@/hooks/use-caretakers";

const PRIVILEGES = [
  { key: "create_property", label: "Create property" },
  { key: "edit_property", label: "Edit property" },
  { key: "delete_assigned_property", label: "Delete assigned property" },
  { key: "manage_tenants", label: "Manage tenants" },
] as const;

export const CaretakerPrivilegesTable = () => {
  const { caretakers, loading, error, refetch } = useCaretakers();
  const { updatePrivileges, pendingId } = useUpdateCaretakerPrivileges();
  const [rows, setRows] = useState<CaretakerRow[]>(caretakers);

  useEffect(() => {
    setRows(caretakers);
  }, [caretakers]);

  const toggle = async (row: CaretakerRow, key: string, checked: boolean) => {
    const nextPrivileges = checked
      ? [...new Set([...row.privileges, key])]
      : row.privileges.filter((p) => p !== key);
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, privileges: nextPrivileges } : r)));
    try {
      const updated = await updatePrivileges(row.id, nextPrivileges);
      setRows((rs) =>
        rs.map((r) => (r.id === updated.id ? { ...r, privileges: updated.privileges } : r)),
      );
      toast.success(`${row.name}'s privileges updated`);
    } catch (err) {
      setRows((rs) => rs.map((r) => (r.id === row.id ? row : r)));
      const message = err instanceof Error ? err.message : "Failed to update privileges";
      toast.error("Could not update privileges", { description: message });
    }
  };

  if (loading) {
    return <p className="text-muted-foreground">Loading caretakers…</p>;
  }

  if (error) {
    return <p className="text-destructive">{error}</p>;
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
        <h3 className="font-display text-xl">No caretakers yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Caretakers you manage will appear here once they are linked to you.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Properties</TableHead>
            <TableHead className="text-center">
              <span className="sr-only">Create property</span>
            </TableHead>
            <TableHead className="text-center">
              <span className="sr-only">Edit property</span>
            </TableHead>
            <TableHead className="text-center">
              <span className="sr-only">Delete assigned property</span>
            </TableHead>
            <TableHead className="text-center">
              <span className="sr-only">Manage tenants</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell className="text-muted-foreground">{c.email}</TableCell>
              <TableCell>
                <Badge variant="secondary">{c.propertyCount}</Badge>
              </TableCell>
              {PRIVILEGES.map((priv) => (
                <TableCell key={priv.key} className="text-center">
                  <Switch
                    aria-label={`${priv.label} for ${c.name}`}
                    checked={c.privileges.includes(priv.key)}
                    disabled={pendingId === c.id}
                    onCheckedChange={(checked) => toggle(c, priv.key, checked)}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="border-t border-border px-4 py-2 text-right">
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          onClick={refetch}
        >
          Refresh
        </button>
      </div>
    </div>
  );
};
