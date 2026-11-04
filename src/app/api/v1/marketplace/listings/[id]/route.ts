import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { toPublicListingProjection } from "@/lib/listings";
import { connectToDatabase } from "@/lib/mongoose";
import { Listing } from "@/models/Listing";
import { ListingPublisher } from "@/models/ListingPublisher";
import { Property } from "@/models/Property";
import { Unit } from "@/models/Unit";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await connectToDatabase();
  const { id } = await context.params;

  let resolvedListingId = id;
  let matchedPublisher = await ListingPublisher.findOne({
    shareCode: id,
    state: "active",
  }).lean();

  if (matchedPublisher) {
    resolvedListingId = matchedPublisher.listingId;
  }

  const listing = await Listing.findOne({
    _id: resolvedListingId,
    state: "active",
    visibility: "public",
    deletedAt: null,
  }).lean();

  if (!listing) {
    return NextResponse.json(
      { error: "Listing not found or no longer available" },
      { status: 404 },
    );
  }

  if (!matchedPublisher) {
    matchedPublisher = await ListingPublisher.findOne({
      listingId: resolvedListingId,
      state: "active",
    }).lean();
  }

  const [property, unit] = await Promise.all([
    Property.findOne({
      _id: listing.propertyId,
      deletedAt: null,
    }).lean(),
    Unit.findOne({
      _id: listing.unitId,
      deletedAt: null,
    }).lean(),
  ]);

  if (!property || !unit) {
    return NextResponse.json({ error: "Listing details unavailable" }, { status: 404 });
  }

  const projection = toPublicListingProjection(listing as any, property, unit, matchedPublisher);

  return NextResponse.json({ listing: projection });
}
