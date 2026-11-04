import { type InferSchemaType, model, models, Schema } from "mongoose";

/**
 * Records that a user viewed a property, to power a "Recently viewed" row on
 * the dashboard. One row per user/property pair, updated on each visit.
 */
const propertyViewSchema = new Schema({
  userId: { type: String, required: true },
  propertyId: { type: String, required: true },
  viewedAt: { type: Date, required: true, default: Date.now },
});

propertyViewSchema.index({ userId: 1, propertyId: 1 }, { unique: true });
propertyViewSchema.index({ userId: 1, viewedAt: -1 });

export type PropertyViewDocument = InferSchemaType<typeof propertyViewSchema>;

export const PropertyView =
  models.PropertyView || model<PropertyViewDocument>("PropertyView", propertyViewSchema);
