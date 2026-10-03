import { type InferSchemaType, model, models, Schema } from "mongoose";

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
    createdById: { type: String, default: "" },
    beds: { type: Number, required: true, min: 0 },
    baths: { type: Number, required: true, min: 0 },
    area: { type: Number, default: 0 },
    published: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  },
);

propertySchema.index({ status: 1, published: 1 });

export type PropertyDocument = InferSchemaType<typeof propertySchema>;

export const Property = models.Property || model<PropertyDocument>("Property", propertySchema);
