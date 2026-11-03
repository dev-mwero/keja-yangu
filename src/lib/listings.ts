import { createHash } from "node:crypto";
import { writeAuditEvent } from "@/lib/audit";
import type { ListingPublisherRole, ListingState } from "@/lib/domain-enums";
import { Listing } from "@/models/Listing";

export const VALID_LISTING_TRANSITIONS: Record<ListingState, readonly ListingState[]> = {
  draft: ["active", "withdrawn"],
  active: ["paused", "let", "expired", "withdrawn"],
  paused: ["active", "let", "expired", "withdrawn"],
  let: ["draft", "withdrawn"],
  expired: ["draft", "withdrawn"],
  withdrawn: [],
};

export function canTransitionListing(from: ListingState, to: ListingState): boolean {
  if (from === to) return true;
  const allowed = VALID_LISTING_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function generateListingShareCode(publisherId: string, listingId: string): string {
  const hash = createHash("sha256").update(`${publisherId}:${listingId}`).digest("hex");
  return `kj-${hash.slice(0, 10)}`;
}

export interface ValidateListingPublishOptions {
  activeLeaseCount?: number;
}

export interface UnitPublishContext {
  _id?: unknown;
  rent?: number | null;
  billingAccountId?: string | null;
  status?: string | null;
  tenantId?: string[] | null;
}

export interface ListingPublishContext {
  askingRent: number;
}

export function validateListingPublish(
  unit: UnitPublishContext,
  listing: ListingPublishContext,
  options?: ValidateListingPublishOptions,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (listing.askingRent <= 0) {
    errors.push("Asking rent must be greater than zero");
  }

  const isOccupied =
    (options?.activeLeaseCount ?? 0) > 0 ||
    unit.status === "occupied" ||
    (Array.isArray(unit.tenantId) && unit.tenantId.length > 0);

  if (isOccupied) {
    errors.push("Cannot publish listing for occupied unit");
  }

  if (!unit.billingAccountId || unit.billingAccountId.trim() === "") {
    errors.push("Unit must have a resolved billing account before publishing");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export interface PublicListingProperty {
  _id?: unknown;
  id?: string;
  title?: string;
  name?: string;
  type?: string;
  location?: string;
  county?: string;
  neighborhood?: string;
  city?: string;
  description?: string;
}

export interface PublicListingUnit {
  _id?: unknown;
  id?: string;
  name?: string;
  floorLevel?: number;
  floorLabel?: string;
  beds?: number;
  baths?: number;
  area?: number;
}

export interface PublicListingPublisher {
  shareCode?: string;
  publisherRole?: ListingPublisherRole;
}

export interface PublicListingProjection {
  id: string;
  headline: string;
  description: string;
  askingRent: number;
  serviceCharge: number;
  depositMonths: number;
  availableFrom: Date | string;
  minimumStayMonths: number;
  amenities: string[];
  media: Array<{ url: string; key?: string; caption?: string; isPrimary?: boolean }>;
  state: ListingState;
  property: {
    id: string;
    title: string;
    type: string;
    location: string;
    description: string;
  };
  unit: {
    id: string;
    name: string;
    floorLevel: number;
    floorLabel: string;
    beds: number;
    baths: number;
    area: number;
  };
  publisher: {
    shareCode: string;
    role: ListingPublisherRole;
  } | null;
}

export function toPublicListingProjection(
  listing: {
    _id?: unknown;
    id?: string;
    headline: string;
    description?: string;
    askingRent: number;
    serviceCharge?: number;
    depositMonths?: number;
    availableFrom: Date | string;
    minimumStayMonths?: number;
    amenities?: string[];
    media?: Array<{ url: string; key?: string; caption?: string; isPrimary?: boolean }>;
    state: ListingState;
  },
  property: PublicListingProperty,
  unit: PublicListingUnit,
  publisher?: PublicListingPublisher | null,
): PublicListingProjection {
  return {
    id: String(listing._id || listing.id || ""),
    headline: listing.headline,
    description: listing.description || "",
    askingRent: listing.askingRent,
    serviceCharge: listing.serviceCharge ?? 0,
    depositMonths: listing.depositMonths ?? 1,
    availableFrom: listing.availableFrom,
    minimumStayMonths: listing.minimumStayMonths ?? 1,
    amenities: listing.amenities ? [...listing.amenities] : [],
    media: listing.media ? listing.media.map((m) => ({ ...m })) : [],
    state: listing.state,
    property: {
      id: String(property._id || property.id || ""),
      title: property.title || property.name || "",
      type: property.type || "",
      location: property.location || property.county || property.city || "",
      description: property.description || "",
    },
    unit: {
      id: String(unit._id || unit.id || ""),
      name: unit.name || "",
      floorLevel: unit.floorLevel ?? 0,
      floorLabel: unit.floorLabel || "",
      beds: unit.beds ?? 0,
      baths: unit.baths ?? 0,
      area: unit.area ?? 0,
    },
    publisher: publisher?.shareCode
      ? {
          shareCode: publisher.shareCode,
          role: publisher.publisherRole || "admin",
        }
      : null,
  };
}

export interface TransitionListingStateInput {
  listingId: string;
  newState: ListingState;
  actorId: string;
  actorRole?: string;
  reason?: string;
}

export async function transitionListingState(input: TransitionListingStateInput) {
  const listing = (await Listing.findById(input.listingId).lean()) as any;
  if (!listing) {
    throw new Error(`Listing ${input.listingId} not found`);
  }

  const currentState = listing.state as ListingState;
  if (!canTransitionListing(currentState, input.newState)) {
    throw new Error(`Illegal transition from '${currentState}' to '${input.newState}'`);
  }

  const updates: Record<string, unknown> = {
    state: input.newState,
  };

  if (input.newState === "active" && !listing.publishedAt) {
    updates.publishedAt = new Date();
  }

  const updated = (await Listing.findOneAndUpdate(
    { _id: input.listingId, version: listing.version },
    {
      $set: updates,
      $inc: { version: 1 },
    },
    { new: true },
  ).lean()) as any;

  if (!updated) {
    throw new Error(
      `Conflict updating listing ${input.listingId}: version mismatch or already modified`,
    );
  }

  await writeAuditEvent({
    actor: {
      userId: input.actorId,
      role: input.actorRole || "admin",
    },
    action: "listing.state_transition",
    entityType: "listing",
    entityId: input.listingId,
    scope: {
      propertyId: listing.propertyId,
      blockId: listing.blockId,
      unitId: listing.unitId,
    },
    before: { state: currentState, version: listing.version },
    after: { state: input.newState, reason: input.reason, version: updated.version },
  });

  return updated;
}

export async function markListingLetForUnit(unitId: string, actorUserId = "system"): Promise<void> {
  const inFlightListings = (await Listing.find({
    unitId,
    state: { $in: ["draft", "active", "paused"] },
    deletedAt: null,
  }).lean()) as any[];

  for (const listing of inFlightListings) {
    await Listing.updateOne({ _id: listing._id }, { $set: { state: "let" }, $inc: { version: 1 } });

    await writeAuditEvent({
      actor: {
        userId: actorUserId,
        role: "system",
      },
      action: "listing.state_transition",
      entityType: "listing",
      entityId: String(listing._id),
      scope: {
        propertyId: listing.propertyId,
        blockId: listing.blockId,
        unitId,
      },
      before: { state: listing.state },
      after: { state: "let", reason: "Unit leased/allocated" },
    });
  }
}
