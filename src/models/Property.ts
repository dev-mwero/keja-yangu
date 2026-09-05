import { Schema, model, models, type InferSchemaType } from "mongoose";

const propertySchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    bedrooms: { type: Number, required: true, min: 0 },
    bathrooms: { type: Number, required: true, min: 0 },
    imageUrl: { type: String, default: "" },
    description: { type: String, default: "" },
    available: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  },
);

export type PropertyDocument = InferSchemaType<typeof propertySchema>;

export const Property =
  models.Property || model<PropertyDocument>("Property", propertySchema);
