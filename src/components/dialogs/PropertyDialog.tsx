"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AmenityPicker } from "@/components/property/AmenityPicker";
import { PropertyImageManager } from "@/components/property/PropertyImageManager";
import {
  PropertyStructureEditor,
  validateBlocks,
} from "@/components/property/PropertyStructureEditor";
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
import { Textarea } from "@/components/ui/textarea";
import { useCaretakers } from "@/hooks/use-caretakers";
import {
  type BlockInputPayload,
  type Property,
  type PropertyInput,
  usePropertyMutations,
} from "@/hooks/use-properties";
import { usePropertyTypes } from "@/hooks/use-property-types";
import { mergeImageUrls } from "@/lib/images";
import { propertyTypeLabel } from "@/lib/property-types";
import { useUploadThing } from "@/lib/uploadthing";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  type: z.string().trim().min(1, "Type is required"),
  location: z.string().trim().min(1, "Location is required"),
  price: z.number().positive("Price must be greater than 0"),
  description: z.string(),
  images: z.string(),
  amenities: z.array(z.string()),
  beds: z.number().int().min(0, "Beds cannot be negative"),
  baths: z.number().int().min(0, "Baths cannot be negative"),
  area: z.number().min(0, "Area cannot be negative"),
  status: z.enum(["available", "occupied", "maintenance"]),
  caretakerIds: z.array(z.string()),
  targetOwnerId: z.string(),
  published: z.boolean(),
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
  const { types } = usePropertyTypes();
  const [blocks, setBlocks] = useState<BlockInputPayload[]>([]);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { startUpload, isUploading } = useUploadThing("propertyImages", {
    onUploadProgress: (p) => setUploadProgress(p),
    onClientUploadComplete: (res) => {
      const urls = res.map((file) => file.ufsUrl);
      setValue("images", mergeImageUrls(getValues("images"), urls));
      setUploadProgress(0);
      toast.success("Images uploaded", {
        description: `${urls.length} image${urls.length === 1 ? "" : "s"} added.`,
      });
    },
    onUploadError: (error) => {
      setUploadProgress(0);
      toast.error("Image upload failed", { description: error.message });
    },
  });

  const buildDefaults = useCallback(
    (): FormValues => ({
      title: property?.title ?? "",
      type: property?.type ?? "apartment",
      location: property?.location ?? "",
      price: property?.price ?? 0,
      description: property?.description ?? "",
      images: (property?.images ?? []).join("\n"),
      amenities: property?.amenities ?? [],
      beds: property?.beds ?? 0,
      baths: property?.baths ?? 0,
      area: property?.area ?? 0,
      status: property?.status ?? "available",
      caretakerIds: property?.caretakerIds ?? [],
      targetOwnerId: "",
      published: property?.published ?? false,
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
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: buildDefaults(),
  });

  const statuses: Property["status"][] = ["available", "occupied", "maintenance"];

  // Keep the current property's type selectable even if it has been
  // deactivated, so editing never silently drops the value.
  const typeOptions = useMemo(() => {
    const options = types.map((t) => ({ key: t.key, label: t.label }));
    const current = property?.type;
    if (current && !options.some((o) => o.key === current)) {
      options.push({ key: current, label: propertyTypeLabel(current) });
    }
    return options;
  }, [types, property?.type]);

  const selectedCaretakerIds = watch("caretakerIds");
  const selectedStatus = watch("status");
  const selectedType = watch("type");
  const selectedPublished = watch("published");

  useEffect(() => {
    if (open) {
      reset(buildDefaults());
      setBlocks([]);
      setStructureError(null);
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

    const structureIssues = mode === "create" && blocks.length > 0 ? validateBlocks(blocks) : [];
    if (structureIssues.length > 0) {
      setStructureError(structureIssues[0]);
      return;
    }
    setStructureError(null);

    const payload: PropertyInput = {
      title: values.title,
      type: values.type,
      location: values.location,
      price: values.price,
      description: values.description.trim() || undefined,
      images: splitLines(values.images),
      amenities: values.amenities,
      beds: values.beds,
      baths: values.baths,
    };
    if (values.area > 0) payload.area = values.area;
    payload.published = values.published;
    if (allowCaretakerIds) payload.caretakerIds = values.caretakerIds;
    if (mode === "edit") payload.status = values.status;
    if (systemAdmin && mode === "create") payload.targetOwnerId = values.targetOwnerId.trim();
    if (mode === "create" && blocks.length > 0) payload.blocks = blocks;

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
                  {typeOptions.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.label}
                    </SelectItem>
                  ))}
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
            <div className="flex items-center justify-between">
              <Label htmlFor="property-images">Images</Label>
              <span className="text-xs text-muted-foreground">
                {splitLines(watch("images")).length} selected
              </span>
            </div>
            <PropertyImageManager
              value={watch("images")}
              onChange={(next) => setValue("images", next, { shouldDirty: true })}
              disabled={pending}
            />
            <details className="rounded-lg border border-border bg-muted/20 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                Add image URLs manually
              </summary>
              <Textarea
                id="property-images"
                rows={2}
                className="mt-2"
                placeholder={"One image URL per line"}
                {...register("images")}
              />
            </details>
            <div className="space-y-2 pt-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = e.target.files ? Array.from(e.target.files) : [];
                  e.target.value = "";
                  if (files.length === 0) return;
                  setUploadProgress(0);
                  await startUpload(files);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isUploading ? `Uploading… ${uploadProgress}%` : "Upload images"}
              </Button>
              {isUploading && (
                <div className="h-1.5 w-full rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Amenities</Label>
            <AmenityPicker
              value={watch("amenities")}
              onChange={(next) => setValue("amenities", next)}
              disabled={pending}
            />
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

          {mode === "create" && (
            <>
              <PropertyStructureEditor
                blocks={blocks}
                onChange={setBlocks}
                baseRent={watch("price")}
                disabled={pending}
              />
              {structureError && <p className="text-xs text-destructive">{structureError}</p>}
            </>
          )}

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="property-published">Published (visible on public site)</Label>
              <p className="text-xs text-muted-foreground">
                Published properties appear on the public listings.
              </p>
            </div>
            <Switch
              id="property-published"
              checked={selectedPublished}
              onCheckedChange={(v) => setValue("published", v)}
            />
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
