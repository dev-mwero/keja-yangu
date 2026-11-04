import { type InferSchemaType, model, models, Schema } from "mongoose";
import { LISTING_PUBLISHER_ROLES, LISTING_PUBLISHER_STATES } from "@/lib/domain-enums";

export type {
  ListingPublisherRole,
  ListingPublisherState,
} from "@/lib/domain-enums";
export { LISTING_PUBLISHER_ROLES, LISTING_PUBLISHER_STATES };

const listingPublisherSchema = new Schema(
  {
    listingId: { type: String, required: true },
    publisherUserId: { type: String, required: true },
    publisherRole: {
      type: String,
      enum: [...LISTING_PUBLISHER_ROLES],
      default: "admin",
    },
    brokerAuthorizationId: { type: String, default: "" },
    shareCode: { type: String, required: true, trim: true },
    state: {
      type: String,
      enum: [...LISTING_PUBLISHER_STATES],
      default: "active",
    },
    startsAt: { type: Date, default: () => new Date() },
    endsAt: { type: Date, default: null },
    createdByUserId: { type: String, required: true },
    revokedByUserId: { type: String, default: "" },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

listingPublisherSchema.index(
  { listingId: 1, publisherUserId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      state: "active",
    },
  },
);

listingPublisherSchema.index({ shareCode: 1 }, { unique: true });
listingPublisherSchema.index({ publisherUserId: 1, state: 1 });

export type ListingPublisherDocument = InferSchemaType<typeof listingPublisherSchema>;

export const ListingPublisher =
  models.ListingPublisher ||
  model<ListingPublisherDocument>("ListingPublisher", listingPublisherSchema);
