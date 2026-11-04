import { type InferSchemaType, model, models, Schema } from "mongoose";
import { LISTING_STATES, LISTING_VISIBILITIES } from "@/lib/domain-enums";
import { softDeletePlugin } from "@/lib/mongoose-soft-delete";

export type { ListingState, ListingVisibility } from "@/lib/domain-enums";
export { LISTING_STATES, LISTING_VISIBILITIES };

const mediaItemSchema = new Schema(
  {
    url: { type: String, required: true },
    key: { type: String, default: "" },
    caption: { type: String, default: "" },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: false },
);

const listingSchema = new Schema(
  {
    propertyId: { type: String, required: true },
    blockId: { type: String, default: "" },
    unitId: { type: String, required: true },
    state: { type: String, enum: [...LISTING_STATES], default: "draft" },
    headline: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    askingRent: { type: Number, required: true, min: 0 },
    serviceCharge: { type: Number, default: 0, min: 0 },
    depositMonths: { type: Number, default: 1, min: 0 },
    availableFrom: { type: Date, default: () => new Date() },
    minimumStayMonths: { type: Number, default: 1, min: 1 },
    amenities: { type: [String], default: [] },
    media: { type: [mediaItemSchema], default: [] },
    visibility: { type: String, enum: [...LISTING_VISIBILITIES], default: "public" },
    canonicalPublisherUserId: { type: String, required: true },
    verifiedByUserId: { type: String, default: "" },
    verifiedAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    version: { type: Number, default: 1, min: 1 },
    createdByUserId: { type: String, required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

listingSchema.plugin(softDeletePlugin);

// Partial unique index: at most one live/in-flight listing per physical unit
listingSchema.index(
  { unitId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      state: { $in: ["draft", "active", "paused", "let"] },
      deletedAt: null,
    },
  },
);

listingSchema.index({ state: 1, availableFrom: 1, expiresAt: 1 });
listingSchema.index({ propertyId: 1, state: 1 });
listingSchema.index({ visibility: 1, state: 1 });

export type ListingDocument = InferSchemaType<typeof listingSchema>;

export const Listing = models.Listing || model<ListingDocument>("Listing", listingSchema);
