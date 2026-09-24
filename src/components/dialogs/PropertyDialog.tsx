"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { useCaretakers } from "@/hooks/use-caretakers";
import { type Property, type PropertyInput, usePropertyMutations } from "@/hooks/use-properties";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  type: z.enum(["room", "apartment", "building"]),
  location: z.string().trim().min(1, "Location is required"),
  price: z.number().positive("Price must be greater than 0"),
  description: z.string(),
  images: z.string(),
  amenities: z.string(),
  beds: z.number().int().min(0, "Beds cannot be negative"),
  baths: z.number().int().min(0, "Baths cannot be negative"),
  area: z.number().min(0, "Area cannot be negative"),
  status: z.enum(["available", "occupied", "maintenance"]),
  caretakerIds: z.array(z.string()),
  targetOwnerId: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

interface PropertyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  property?: Property | null;
  allowCaretakerIds?: boolean;
  systemAdmin?: boolean;
  onSuccess?: () => void;
}

const splitLines = (value: string): string[] =>
  value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

const splitList = (value: string): string[] =>
  value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const PropertyDialog = ({
  open,
  onOpenChange,
  mode,
  property = null,
  allowCaretakerIds = true,
  systemAdmin = false,
  onSuccess,
}: PropertyDialogProps) => {
  const { createProperty, updateProperty, pending } = usePropertyMutations();
  const { caretakers } = useCaretakers();

  const buildDefaults = useCallback(
    (): FormValues => ({
      title: property?.title ?? "",
      type: property?.type ?? "apartment",
      location: property?.location ?? "",
      price: property?.price ?? 0,
      description: property?.description ?? "",
      images: (property?.images ?? []).join("\n"),
      amenities: (property?.amenities ?? []).join(", "),
      beds: property?.beds ?? 0,
      baths: property?.baths ?? 0,
      area: property?.area ?? 0,
      status: property?.status ?? "available",
      caretakerIds: property?.caretakerIds ?? [],
      targetOwnerId: "",
    }),
    [property],
  );

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: buildDefaults(),
  });

  const statuses: Property["status"][] = ["available", "occupied", "maintenance"];

  const selectedCaretakerIds = watch("caretakerIds");
  const selectedStatus = watch("status");
  const selectedType = watch("type");

  useEffect(() => {
    if (open) {
      reset(buildDefaults());
    }
  }, [open, buildDefaults, reset]);

  const toggleCaretaker = (id: string) => {
    const next = selectedCaretakerIds.includes(id)
      ? selectedCaretakerIds.filter((x) => x !== id)
      : [...selectedCaretakerIds, id];
    setValue("caretakerIds", next);
  };

  const caretakerOptions = [
    ...caretakers.map((c) => ({ id: c.id, label: c.name || c.email || c.id })),
    ...(property?.caretakerIds ?? [])
      .filter((id) => !caretakers.some((c) => c.id === id))
      .map((id) => ({ id, label: id })),
  ];

  const onSubmit = async (values: FormValues) => {
    if (systemAdmin && mode === "create" && !values.targetOwnerId.trim()) {
      setError("targetOwnerId", { message: "Property owner id is required" });
      return;
    }

    const payload: PropertyInput = {
      title: values.title,
      type: values.type,
      location: values.location,
      price: values.price,
      description: values.description.trim() || undefined,
      images: splitLines(values.images),
      amenities: splitList(values.amenities),
      beds: values.beds,
      baths: values.baths,
    };
    if (values.area > 0) payload.area = values.area;
    if (allowCaretakerIds) payload.caretakerIds = values.caretakerIds;
    if (mode === "edit") payload.status = values.status;
    if (systemAdmin && mode === "create") payload.targetOwnerId = values.targetOwnerId.trim();

    try {
      if (mode === "create") {
        await createProperty(payload);
        toast.success("Property created", {
          description: `${payload.title} was added to your portfolio.`,
        });
      } else if (property) {
        await updateProperty(property._id, payload);
        toast.success("Property updated", {
          description: `${payload.title} was saved.`,
        });
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.error(mode === "create" ? "Could not create property" : "Could not update property", {
        description: message,
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add property" : "Edit property"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "List a new property in your portfolio."
              : "Update the details of this property."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="property-title">Title</Label>
            <Input
              id="property-title"
              placeholder="e.g. Sunlit Studio in Kilimani"
              {...register("title")}
            />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={selectedType}
                onValueChange={(v) => setValue("type", v as FormValues["type"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="room">Room</SelectItem>
                  <SelectItem value="apartment">Apartment</SelectItem>
                  <SelectItem value="building">Building</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="property-price">Price (KES/month)</Label>
              <Input
                id="property-price"
                type="number"
                min={0}
                placeholder="45000"
                {...register("price", { valueAsNumber: true })}
              />
              {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="property-location">Location</Label>
            <Input
              id="property-location"
              placeholder="e.g. Kilimani, Nairobi"
              {...register("location")}
            />
            {errors.location && (
              <p className="text-xs text-destructive">{errors.location.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="property-description">Description</Label>
            <Textarea
              id="property-description"
              rows={3}
              placeholder="A short description of the property…"
              {...register("description")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="property-images">Images</Label>
            <Textarea
              id="property-images"
              rows={2}
              placeholder={"One image URL per line"}
              {...register("images")}
            />
            <p className="text-xs text-muted-foreground">One image URL per line.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="property-amenities">Amenities</Label>
            <Input
              id="property-amenities"
              placeholder="Wi-Fi, Parking, Security 24/7"
              {...register("amenities")}
            />
            <p className="text-xs text-muted-foreground">Comma separated.</p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="property-beds">Beds</Label>
              <Input
                id="property-beds"
                type="number"
                min={0}
                {...register("beds", { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="property-baths">Baths</Label>
              <Input
                id="property-baths"
                type="number"
                min={0}
                {...register("baths", { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="property-area">Area (m²)</Label>
              <Input
                id="property-area"
                type="number"
                min={0}
                {...register("area", { valueAsNumber: true })}
              />
            </div>
          </div>

          {mode === "edit" && (
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={selectedStatus}
                onValueChange={(v) => setValue("status", v as Property["status"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {systemAdmin && mode === "create" && (
            <div className="space-y-2">
              <Label htmlFor="property-owner">Property owner id</Label>
              <Input
                id="property-owner"
                placeholder="24-hex owner user id"
                {...register("targetOwnerId")}
              />
              {errors.targetOwnerId && (
                <p className="text-xs text-destructive">{errors.targetOwnerId.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                The property is created on behalf of this owner.
              </p>
            </div>
          )}

          {allowCaretakerIds && caretakerOptions.length > 0 && (
            <div className="space-y-2">
              <Label>Assigned caretakers</Label>
              <div className="flex flex-wrap gap-2">
                {caretakerOptions.map((c) => {
                  const selected = selectedCaretakerIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCaretaker(c.id)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-primary/50",
                      )}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="rounded-full" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "create" ? "Create property" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
