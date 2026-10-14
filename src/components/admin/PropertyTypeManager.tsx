"use client";

import { Loader2 } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { usePropertyTypeMutations, usePropertyTypes } from "@/hooks/use-property-types";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";

export const PropertyTypeManager = () => {
  const { types, loading, refetch } = usePropertyTypes({ all: true });
  const { createType, updateType, pending } = usePropertyTypeMutations();

  const [label, setLabel] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    try {
      await createType(trimmed);
      toast.success("Property type added", { description: trimmed });
      setLabel("");
      refetch();
    } catch (error) {
      toast.error("Could not add property type", { description: errorText(error) });
    }
  };

  const handleRename = async (id: string) => {
    const trimmed = editLabel.trim();
    if (!trimmed) return;
    try {
      await updateType(id, { label: trimmed });
      toast.success("Property type renamed");
      setEditId(null);
      setEditLabel("");
      refetch();
    } catch (error) {
      toast.error("Could not rename property type", { description: errorText(error) });
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    try {
      await updateType(id, { active });
      toast.success(active ? "Property type activated" : "Property type deactivated");
      refetch();
    } catch (error) {
      toast.error("Could not update property type", { description: errorText(error) });
    }
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleAdd}
        className="rounded-2xl border border-border bg-card p-6 shadow-soft"
      >
        <h3 className="font-display text-lg font-semibold">Add a property type</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          New types become available to every property form across the platform.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1 space-y-2">
            <Label htmlFor="new-property-type">Name</Label>
            <Input
              id="new-property-type"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Townhouse"
            />
          </div>
          <Button type="submit" className="rounded-full" disabled={pending || !label.trim()}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add type
          </Button>
        </div>
      </form>

      <div className="rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border p-6">
          <h3 className="font-display text-lg font-semibold">Property types</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Rename a type without affecting existing properties, or deactivate one to hide it from
            new listings.
          </p>
        </div>
        <div className="divide-y divide-border">
          {loading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading property types…
            </div>
          ) : types.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No property types yet.</p>
          ) : (
            types.map((type) => (
              <div
                key={type.id}
                className="flex flex-wrap items-center justify-between gap-4 p-4 sm:px-6"
              >
                <div className="min-w-[180px] flex-1">
                  {editId === type.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(type.id);
                          if (e.key === "Escape") setEditId(null);
                        }}
                      />
                      <Button
                        size="sm"
                        className="rounded-full"
                        onClick={() => handleRename(type.id)}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-full"
                        onClick={() => setEditId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{type.label}</span>
                      <span className="text-xs text-muted-foreground">{type.key}</span>
                      {!type.active && (
                        <Badge variant="outline" className="text-muted-foreground">
                          Inactive
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full"
                    onClick={() => {
                      setEditId(type.id);
                      setEditLabel(type.label);
                    }}
                  >
                    Rename
                  </Button>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`active-${type.id}`} className="text-xs text-muted-foreground">
                      Active
                    </Label>
                    <Switch
                      id={`active-${type.id}`}
                      checked={type.active}
                      disabled={pending}
                      onCheckedChange={(checked) => handleToggle(type.id, checked)}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
