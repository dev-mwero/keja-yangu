"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePropertyServiceFees, createServiceFee, disableServiceFee, updateServiceFee } from "@/hooks/use-service-fees";
import { useUnits } from "@/hooks/use-units";
import { formatKES } from "@/lib/format";
import type { ServiceFeeItem } from "@/types/service-fees";

const feeFormSchema = z
  .object({
    label: z.string().trim().min(1, "Enter a fee name").max(60),
    amount: z.coerce.number().nonnegative("Amount cannot be negative"),
    active: z.boolean(),
    sortOrder: z.coerce.number().int(),
    appliesTo: z.enum(["all", "selected"]),
    unitIds: z.array(z.string()),
  })
  .superRefine((values, ctx) => {
    if (values.appliesTo === "selected" && values.unitIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["unitIds"],
        message: "Select at least one unit",
      });
    }
  });

type FeeFormValues = z.infer<typeof feeFormSchema>;
type FeeFormInput = z.input<typeof feeFormSchema>;

interface Props {
  propertyId: string;
}

export function ServiceFeesManager({ propertyId }: Props) {
  const { items, loading, error, refetch } = usePropertyServiceFees(propertyId);
  const { units } = useUnits({ propertyId }, { fetchAll: true });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceFeeItem | null>(null);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (item: ServiceFeeItem) => {
    setEditing(item);
    setDialogOpen(true);
  };

  const toggleActive = async (item: ServiceFeeItem, active: boolean) => {
    setPendingItemId(item._id);
    try {
      await updateServiceFee(propertyId, item._id, { active });
      refetch();
    } catch (cause) {
      toast.error("Could not update service fee", {
        description: cause instanceof Error ? cause.message : undefined,
      });
    } finally {
      setPendingItemId(null);
    }
  };

  const remove = async (item: ServiceFeeItem) => {
    setPendingItemId(item._id);
    try {
      await disableServiceFee(propertyId, item._id);
      toast.success("Service fee disabled");
      refetch();
    } catch (cause) {
      toast.error("Could not disable service fee", {
        description: cause instanceof Error ? cause.message : undefined,
      });
    } finally {
      setPendingItemId(null);
    }
  };

  const save = async (values: FeeFormValues) => {
    const payload = {
      ...values,
      unitIds: values.appliesTo === "selected" ? values.unitIds : [],
    };
    try {
      if (editing) {
        await updateServiceFee(propertyId, editing._id, payload);
        toast.success("Service fee updated");
      } else {
        await createServiceFee(propertyId, payload);
        toast.success("Service fee added");
      }
      setDialogOpen(false);
      setEditing(null);
      refetch();
    } catch (cause) {
      toast.error("Could not save service fee", {
        description: cause instanceof Error ? cause.message : undefined,
      });
    }
  };

  return (
    <section className="space-y-3" aria-labelledby="service-fees-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="service-fees-title" className="font-display text-lg">
            Service fees
          </h2>
          <p className="text-xs text-muted-foreground">
            Monthly charges included on each unit's rent invoice.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add fee item
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fee item</TableHead>
              <TableHead>Monthly amount</TableHead>
              <TableHead>Applies to</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-7 text-center text-muted-foreground">
                  Loading service fees…
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={5} className="py-7 text-center text-destructive">
                  {error}
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-7 text-center text-muted-foreground">
                  No service fees configured.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item._id}>
                  <TableCell className="font-medium">{item.label}</TableCell>
                  <TableCell className="tabular-nums">{formatKES(item.amount)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.appliesTo === "all"
                      ? "All units"
                      : `${item.unitIds.length} selected unit${item.unitIds.length === 1 ? "" : "s"}`}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={item.active}
                      disabled={pendingItemId === item._id}
                      aria-label={`${item.active ? "Disable" : "Enable"} ${item.label}`}
                      onCheckedChange={(active) => void toggleActive(item, active)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${item.label}`}
                      onClick={() => openEdit(item)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Disable ${item.label}`}
                      disabled={!item.active || pendingItemId === item._id}
                      onClick={() => void remove(item)}
                    >
                      {pendingItemId === item._id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          {dialogOpen && (
            <ServiceFeeForm
              key={editing?._id ?? "new"}
              item={editing}
              units={units}
              onCancel={() => setDialogOpen(false)}
              onSubmit={save}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ServiceFeeForm({
  item,
  units,
  onCancel,
  onSubmit,
}: {
  item: ServiceFeeItem | null;
  units: Array<{ _id: string; name: string; blockName: string; floorLabel: string }>;
  onCancel: () => void;
  onSubmit: (values: FeeFormValues) => Promise<void>;
}) {
  const [unitQuery, setUnitQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FeeFormInput, unknown, FeeFormValues>({
    resolver: zodResolver(feeFormSchema),
    defaultValues: {
      label: item?.label ?? "",
      amount: item?.amount ?? 0,
      active: item?.active ?? true,
      sortOrder: item?.sortOrder ?? 0,
      appliesTo: item?.appliesTo ?? "all",
      unitIds: item?.unitIds ?? [],
    },
  });
  const appliesTo = watch("appliesTo");
  const selectedIds = watch("unitIds");
  const matchingUnits = units.filter((unit) =>
    `${unit.name} ${unit.blockName} ${unit.floorLabel}`
      .toLocaleLowerCase()
      .includes(unitQuery.trim().toLocaleLowerCase()),
  );

  const toggleUnit = (unitId: string) => {
    const next = selectedIds.includes(unitId)
      ? selectedIds.filter((id) => id !== unitId)
      : [...selectedIds, unitId];
    setValue("unitIds", next, { shouldValidate: true });
  };

  const submit = async (values: FeeFormValues) => {
    setSaving(true);
    try {
      await onSubmit(values);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{item ? "Edit service fee" : "Add service fee"}</DialogTitle>
        <DialogDescription>Set a recurring monthly amount for this property.</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={handleSubmit(submit)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="service-fee-label">Fee name</Label>
            <Input id="service-fee-label" autoFocus {...register("label")} />
            {errors.label && <p className="text-xs text-destructive">{errors.label.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="service-fee-amount">Monthly amount (KES)</Label>
            <Input
              id="service-fee-amount"
              type="number"
              min={0}
              step={1}
              {...register("amount", { valueAsNumber: true })}
            />
            {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="service-fee-sort">Display order</Label>
            <Input
              id="service-fee-sort"
              type="number"
              step={1}
              {...register("sortOrder", { valueAsNumber: true })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Applies to</Label>
            <Select
              value={appliesTo}
              onValueChange={(value) =>
                setValue("appliesTo", value as FeeFormValues["appliesTo"], {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All current and future units</SelectItem>
                <SelectItem value="selected">Selected units</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {appliesTo === "selected" && (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="service-fee-unit-search">Units</Label>
              <Input
                id="service-fee-unit-search"
                value={unitQuery}
                onChange={(event) => setUnitQuery(event.target.value)}
                placeholder="Search by unit, block or floor"
              />
              <div className="max-h-48 divide-y overflow-y-auto rounded-md border">
                {matchingUnits.map((unit) => (
                  <label
                    key={unit._id}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(unit._id)}
                      onChange={() => toggleUnit(unit._id)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="min-w-0 flex-1 truncate">{unit.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {[unit.blockName, unit.floorLabel].filter(Boolean).join(" · ")}
                    </span>
                  </label>
                ))}
                {matchingUnits.length === 0 && (
                  <p className="px-3 py-4 text-sm text-muted-foreground">No matching units.</p>
                )}
              </div>
              {errors.unitIds && (
                <p className="text-xs text-destructive">{errors.unitIds.message}</p>
              )}
            </div>
          )}
          <label className="flex items-center justify-between gap-3 sm:col-span-2">
            <span className="text-sm font-medium">Active</span>
            <Switch
              checked={watch("active")}
              onCheckedChange={(active) => setValue("active", active)}
              aria-label="Active service fee"
            />
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {item ? "Save changes" : "Add fee item"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}