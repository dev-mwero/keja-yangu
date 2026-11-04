import { type InferSchemaType, model, models, Schema } from "mongoose";

/**
 * A user's favourited (saved) unit. One row per (user, unit); the unique index
 * makes toggle idempotent. Any unit on a published property may be saved,
 * regardless of the unit's current status (enforced in the route layer).
 */
const unitFavoriteSchema = new Schema(
  {
    userId: { type: String, required: true },
    unitId: { type: String, required: true },
    propertyId: { type: String, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

// One favourite per user per unit.
unitFavoriteSchema.index({ userId: 1, unitId: 1 }, { unique: true });
unitFavoriteSchema.index({ userId: 1, createdAt: -1 });
unitFavoriteSchema.index({ unitId: 1 });

export type UnitFavoriteDocument = InferSchemaType<typeof unitFavoriteSchema>;

export const UnitFavorite =
  models.UnitFavorite || model<UnitFavoriteDocument>("UnitFavorite", unitFavoriteSchema);
