import type { ListingState } from "@/lib/domain-enums";

export interface BackfillUnitInput {
  _id: string;
  propertyId: string;
  blockId?: string;
  name: string;
  rent?: number | null;
  serviceCharge?: number;
  beds?: number;
  baths?: number;
  status: string;
  tenantId?: string[];
  billingAccountId?: string;
}

export interface BackfillPropertyInput {
  _id: string;
  title: string;
  price?: number;
  images?: string[];
  amenities?: string[];
  ownerId?: string;
}

export interface BackfillExistingListingInput {
  unitId: string;
  state: ListingState | string;
}

export interface BackfillActiveLeaseInput {
  unitId: string;
  status: string;
}

export interface PlanListingBackfillInput {
  units: BackfillUnitInput[];
  properties: BackfillPropertyInput[];
  existingListings: BackfillExistingListingInput[];
  activeLeases: BackfillActiveLeaseInput[];
  canonicalPublisherUserId: string;
}

export interface PlannedDraftListing {
  propertyId: string;
  blockId: string;
  unitId: string;
  state: "draft";
  headline: string;
  description: string;
  askingRent: number;
  serviceCharge: number;
  depositMonths: number;
  availableFrom: Date;
  minimumStayMonths: number;
  amenities: string[];
  media: Array<{ url: string; isPrimary: boolean }>;
  visibility: "public";
  canonicalPublisherUserId: string;
  createdByUserId: string;
}

export interface SkippedBackfillUnit {
  unitId: string;
  reason: string;
}

export interface PlanListingBackfillResult {
  plannedListings: PlannedDraftListing[];
  skippedUnits: SkippedBackfillUnit[];
  warnings: string[];
}

const IN_FLIGHT_LISTING_STATES = new Set(["draft", "active", "paused", "let"]);

export function planListingBackfill(input: PlanListingBackfillInput): PlanListingBackfillResult {
  const propertyMap = new Map<string, BackfillPropertyInput>();
  for (const property of input.properties) {
    propertyMap.set(String(property._id), property);
  }

  const occupiedUnitIds = new Set<string>();
  for (const lease of input.activeLeases) {
    if (lease.status === "active") {
      occupiedUnitIds.add(String(lease.unitId));
    }
  }

  const existingListingUnitIds = new Set<string>();
  for (const listing of input.existingListings) {
    if (IN_FLIGHT_LISTING_STATES.has(listing.state)) {
      existingListingUnitIds.add(String(listing.unitId));
    }
  }

  const plannedListings: PlannedDraftListing[] = [];
  const skippedUnits: SkippedBackfillUnit[] = [];
  const warnings: string[] = [];

  for (const unit of input.units) {
    const unitId = String(unit._id);

    if (existingListingUnitIds.has(unitId)) {
      skippedUnits.push({
        unitId,
        reason: "Already has active or draft listing",
      });
      continue;
    }

    if (
      occupiedUnitIds.has(unitId) ||
      unit.status === "occupied" ||
      (Array.isArray(unit.tenantId) && unit.tenantId.length > 0)
    ) {
      skippedUnits.push({
        unitId,
        reason: "Unit is currently occupied",
      });
      continue;
    }

    const property = propertyMap.get(String(unit.propertyId));
    if (!property) {
      skippedUnits.push({
        unitId,
        reason: `Property ${unit.propertyId} not found`,
      });
      continue;
    }

    const askingRent = unit.rent ?? property.price ?? 0;
    if (askingRent <= 0) {
      warnings.push(`Unit ${unit.name} (${unitId}) has zero or unset rent`);
    }

    const headline = `${property.title} - Unit ${unit.name}`;
    const description = `Spacious unit in ${property.title}`;
    const amenities = property.amenities ? [...property.amenities] : [];
    const media = (property.images || []).map((url, index) => ({
      url,
      isPrimary: index === 0,
    }));

    plannedListings.push({
      propertyId: String(property._id),
      blockId: unit.blockId ? String(unit.blockId) : "",
      unitId,
      state: "draft",
      headline,
      description,
      askingRent,
      serviceCharge: unit.serviceCharge ?? 0,
      depositMonths: 1,
      availableFrom: new Date(),
      minimumStayMonths: 1,
      amenities,
      media,
      visibility: "public",
      canonicalPublisherUserId: input.canonicalPublisherUserId,
      createdByUserId: input.canonicalPublisherUserId,
    });
  }

  return {
    plannedListings,
    skippedUnits,
    warnings,
  };
}
