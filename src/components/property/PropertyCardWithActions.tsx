"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { DeletePropertyDialog } from "@/components/dialogs/DeletePropertyDialog";
import { PropertyDialog } from "@/components/dialogs/PropertyDialog";
import { PropertyCard } from "@/components/PropertyCard";
import { Button } from "@/components/ui/button";
import type { Property } from "@/hooks/use-properties";

interface PropertyCardWithActionsProps {
  property: Property;
  canEdit?: boolean;
  canDelete?: boolean;
  allowCaretakerIds?: boolean;
  systemAdmin?: boolean;
  onChanged?: () => void;
}

export const PropertyCardWithActions = ({
  property,
  canEdit = false,
  canDelete = false,
  allowCaretakerIds = true,
  systemAdmin = false,
  onChanged,
}: PropertyCardWithActionsProps) => {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const showActions = canEdit || canDelete;

  return (
    <div className="relative">
      <PropertyCard
        property={{
          id: property._id,
          title: property.title,
          type: property.type,
          location: property.location,
          price: property.price,
          description: property.description,
          images: property.images.length > 0 ? property.images : ["/images/property-1.jpg"],
          amenities: property.amenities,
          status: property.status,
          ownerId: property.ownerId,
          caretakerIds: property.caretakerIds,
          beds: property.beds,
          baths: property.baths,
          area: property.area,
        }}
      />
      {showActions && (
        <div className="absolute right-4 top-4 z-10 flex gap-2">
          {canEdit && (
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 rounded-full shadow-soft"
              aria-label={`Edit ${property.title}`}
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {canDelete && (
            <Button
              size="icon"
              variant="destructive"
              className="h-8 w-8 rounded-full shadow-soft"
              aria-label={`Delete ${property.title}`}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}

      <PropertyDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        property={property}
        allowCaretakerIds={allowCaretakerIds}
        systemAdmin={systemAdmin}
        onSuccess={onChanged}
      />
      <DeletePropertyDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        property={property}
        onDeleted={onChanged}
      />
    </div>
  );
};
