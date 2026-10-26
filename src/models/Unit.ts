import { type InferSchemaType, model, models, Schema } from "mongoose";
import { UNIT_STATUSES } from "@/lib/domain-enums";
import { softDeletePlugin } from "@/lib/mongoose-soft-delete";

export type { UnitStatus } from "@/lib/domain-enums";
export { UNIT_STATUSES };

const unitSchema = new Schema(
  {
    propertyId: { type: String, required: true },
    ownerId: { type: String, required: true },
    blockId: { type: String, required: true },
    blockName: { type: String, required: true, trim: true },
    floorId: { type: String, required: true },
    floorLevel: { type: Number, required: true },
    floorLabel: { type: String, trim: true, default: "" },
    // Unit name: floor digit + letter, e.g. "3A", "GA". Unique within a block.
    name: { type: String, required: true, trim: true },
    letter: { type: String, trim: true, default: "" },
    status: { type: String, enum: [...UNIT_STATUSES], default: "available" },
    // Optional rent override; falls back to floor/block/property rent.
    rent: { type: Number, min: 0, default: null },
    beds: { type: Number, min: 0, default: 0 },
    baths: { type: Number, min: 0, default: 0 },
    area: { type: Number, min: 0, default: 0 },
    // Current occupants (tenant ids); empty when vacant. A tenant may hold
    // multiple units, so this is an array rather than a single id.
    tenantId: { type: [String], default: [] },
    // Set when the unit is soft-deleted (hidden from reads, restorable).
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

// Unit names are unique per block (not per property) among live units only.
unitSchema.index(
  { blockId: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
unitSchema.index({ propertyId: 1, status: 1 });
unitSchema.index({ ownerId: 1, status: 1 });
unitSchema.index({ blockId: 1, floorLevel: 1 });
softDeletePlugin(unitSchema);

export type UnitDocument = InferSchemaType<typeof unitSchema>;

export const Unit = models.Unit || model("Unit", unitSchema);
