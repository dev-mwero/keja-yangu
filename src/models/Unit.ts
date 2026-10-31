import { type InferSchemaType, model, models, Schema } from "mongoose";
import { PROPERTY_PURPOSES, UNIT_STATUSES } from "@/lib/domain-enums";
import { softDeletePlugin } from "@/lib/mongoose-soft-delete";

export type { PropertyPurpose, UnitStatus } from "@/lib/domain-enums";
export { PROPERTY_PURPOSES, UNIT_STATUSES };

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
    // Timestamp of the last status transition; used to key availability
    // notifications so each transition notifies favourites exactly once.
    statusChangedAt: { type: Date, default: null },
    // Optional purpose override; falls back to floor/block/property purpose.
    purpose: { type: String, enum: [...PROPERTY_PURPOSES, null], default: null },
    // Optional rent override; falls back to floor/block/property rent.
    rent: { type: Number, min: 0, default: null },
    // Service charge per period (major units, KES), used by the caretaker for
    // water, garbage collection, minor repairs, etc.
    serviceCharge: { type: Number, min: 0, default: 0 },
    // When true, the collected rent already includes the service charge and
    // managers split it into rent + service fee by the share percentages below.
    rentIncludesServiceCharge: { type: Boolean, default: false },
    // Share of the collected amount that is rent (→ owner). Only meaningful
    // when rentIncludesServiceCharge is true.
    rentSharePercent: { type: Number, min: 0, max: 100, default: 100 },
    // Share of the collected amount that is the service fee (→ caretaker).
    serviceChargeSharePercent: { type: Number, min: 0, max: 100, default: 0 },
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

// When rent already includes the service charge, the rent and service-fee
// shares must sum to 100 so the collected amount can be split exactly.
unitSchema.pre("validate", function validateServiceChargeShares() {
  const unit = this as {
    rentIncludesServiceCharge?: boolean;
    rentSharePercent?: number;
    serviceChargeSharePercent?: number;
  };
  if (!unit.rentIncludesServiceCharge) return;
  const total = (unit.rentSharePercent ?? 0) + (unit.serviceChargeSharePercent ?? 0);
  if (total !== 100) {
    this.invalidate(
      "rentSharePercent",
      "rentSharePercent and serviceChargeSharePercent must sum to 100 when rent includes the service charge",
    );
    this.invalidate(
      "serviceChargeSharePercent",
      "rentSharePercent and serviceChargeSharePercent must sum to 100 when rent includes the service charge",
    );
  }
});

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
