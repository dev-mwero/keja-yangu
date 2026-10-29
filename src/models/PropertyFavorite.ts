import { type InferSchemaType, model, models, Schema } from "mongoose";

/**
 * A user's favourited (loved/saved) property. One row per (user, property);
 * the unique index makes toggle idempotent. Only published, available
 * properties can be favourited (enforced in the route layer).
 */
const propertyFavoriteSchema = new Schema(
  {
    userId: { type: String, required: true },
    propertyId: { type: String, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

// One favourite per user per property.
propertyFavoriteSchema.index({ userId: 1, propertyId: 1 }, { unique: true });
propertyFavoriteSchema.index({ userId: 1, createdAt: -1 });

export type PropertyFavoriteDocument = InferSchemaType<typeof propertyFavoriteSchema>;

export const PropertyFavorite =
  models.PropertyFavorite ||
  model<PropertyFavoriteDocument>("PropertyFavorite", propertyFavoriteSchema);
