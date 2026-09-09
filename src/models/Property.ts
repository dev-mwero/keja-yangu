import { Schema, model, models, type InferSchemaType } from "mongoose";

const propertySchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ["room", "apartment", "building"], default: "apartment" },
    location: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    description: { type: String, default: "" },
    images: { type: [String], default: [] },
    amenities: { type: [String], default: [] },
    status: { type: String, enum: ["available", "occupied", "maintenance"], default: "available" },
    ownerId: { type: String, default: "" },
    caretakerIds: { type: [String], default: [] },
    beds: { type: Number, required: true, min: 0 },
    baths: { type: Number, required: true, min: 0 },
    area: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
);

export type PropertyDocument = InferSchemaType<typeof propertySchema>;

export const Property =
  models.Property || model<PropertyDocument>("Property", propertySchema);
