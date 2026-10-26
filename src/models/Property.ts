import { type InferSchemaType, model, models, Schema } from "mongoose";
import { DEFAULT_PROPERTY_PURPOSE, PROPERTY_PURPOSES } from "@/lib/domain-enums";
import { softDeletePlugin } from "@/lib/mongoose-soft-delete";

const floorSchema = new Schema(
  {
    level: { type: Number, required: true },
    label: { type: String, trim: true, default: "" },
    // How many units this floor holds (informational; units are materialized
    // in the separate `Unit` collection).
    unitsPerFloor: { type: Number, min: 0, default: 0 },
    // Optional rent override for every unit on this floor.
    rentOverride: { type: Number, min: 0, default: null },
    // Optional purpose override for every unit on this floor.
    purpose: { type: String, enum: [...PROPERTY_PURPOSES, null], default: null },
  },
  { _id: true },
);

const blockSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
    // Optional rent override for every unit in this block.
    rentOverride: { type: Number, min: 0, default: null },
    // Optional purpose override for every unit in this block.
    purpose: { type: String, enum: [...PROPERTY_PURPOSES, null], default: null },
    floors: { type: [floorSchema], default: [] },
  },
  { _id: true },
);

const propertySchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    // A key from the platform-wide, admin-managed property taxonomy
    // (`PropertyType`). Not an enum so administrators can add new types.
    type: { type: String, default: "apartment" },
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
    // Date the property construction / project was completed.
    dateCompleted: { type: Date, default: null },
    // Baseline purpose of the property; can be overridden at block, floor, unit levels.
    purpose: {
      type: String,
      enum: [...PROPERTY_PURPOSES],
      default: DEFAULT_PROPERTY_PURPOSE,
    },
    // Physical hierarchy: Property -> blocks -> floors -> units (units live in
    // the separate `Unit` collection and reference block/floor subdoc ids).
    blocks: { type: [blockSchema], default: [] },
    // Set when the property is soft-deleted (hidden from reads, restorable).
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

propertySchema.index({ status: 1, published: 1 });
softDeletePlugin(propertySchema);

export type PropertyDocument = InferSchemaType<typeof propertySchema>;

export const Property = models.Property || model<PropertyDocument>("Property", propertySchema);
