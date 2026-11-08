import { type InferSchemaType, model, models, Schema } from "mongoose";
import { PROPERTY_PURPOSES } from "@/lib/domain-enums";

/**
 * Standalone `Block` collection — mirrors the embedded `Property.blocks[]`
 * subdocs so that blocks can be queried, indexed and referenced independently
 * of the parent property document.
 *
 * The source of truth during Phase 2 is still `Property.blocks[]`; this
 * collection is kept in sync by the property creation and structure-edit routes.
 * Once dual-write is verified in staging the read flag can be flipped to use
 * this collection as the primary source.
 *
 * Rollback: disable the `Block` read flag — the mirror can always be rebuilt
 * from `Property.blocks[]` using `scripts/backfill-blocks.ts`.
 */
const blockSchema = new Schema(
  {
    propertyId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
    // Optional rent override for every unit in this block.
    rentOverride: { type: Number, min: 0, default: null },
    // Optional purpose override for every unit in this block.
    purpose: { type: String, enum: [...PROPERTY_PURPOSES, null], default: null },
    // When true, every unit on every floor of this block spans to the floor above (duplex).
    duplex: { type: Boolean, default: false },
    /**
     * The `_id` of the corresponding embedded subdoc in `Property.blocks[]`.
     * Used by the backfill script and sync logic to match records idempotently.
     */
    legacyEmbeddedId: { type: String, default: "" },
    // Set when the block is soft-deleted (hidden from reads, restorable).
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

// Fast property-level queries.
blockSchema.index({ propertyId: 1, deletedAt: 1 });
// Idempotent backfill lookup.
blockSchema.index({ legacyEmbeddedId: 1 }, { sparse: true });
// Block names are unique within a live property.
blockSchema.index(
  { propertyId: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

export type BlockDocument = InferSchemaType<typeof blockSchema>;

export const Block = models.Block || model<BlockDocument>("Block", blockSchema);
