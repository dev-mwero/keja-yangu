"use client";

import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { type Property, usePropertyMutations } from "@/hooks/use-properties";

interface DeletePropertyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: Property | null;
  onDeleted?: () => void;
}

export const DeletePropertyDialog = ({
  open,
  onOpenChange,
  property,
  onDeleted,
}: DeletePropertyDialogProps) => {
  const { deleteProperty, pending } = usePropertyMutations();

  const handleDelete = async () => {
    if (!property) return;
    try {
      await deleteProperty(property._id);
      toast.success("Property deleted", {
        description: `${property.title} was removed from your portfolio.`,
      });
      onDeleted?.();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete property";
      toast.error("Could not delete property", { description: message });
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {property?.title ?? "this property"}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the property from your portfolio. Properties that still have
            tenants assigned cannot be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={handleDelete} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete property
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
