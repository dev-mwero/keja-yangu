import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { toPublicListingProjection } from "@/lib/listings";
import { connectToDatabase } from "@/lib/mongoose";
import { parsePagination } from "@/lib/pagination";
import { Listing } from "@/models/Listing";
import { ListingPublisher } from "@/models/ListingPublisher";
import { Property } from "@/models/Property";
import { Unit } from "@/models/Unit";

export async function GET(request: NextRequest) {
  await connectToDatabase();

  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? "20",
  });
  const skip = (page - 1) * limit;

  const search =
    request.nextUrl.searchParams.get("search") || request.nextUrl.searchParams.get("q");
  const county =
    request.nextUrl.searchParams.get("county") || request.nextUrl.searchParams.get("location");
  const propertyType = request.nextUrl.searchParams.get("propertyType");
  const minRent = request.nextUrl.searchParams.get("minRent");
  const maxRent = request.nextUrl.searchParams.get("maxRent");
  const beds = request.nextUrl.searchParams.get("beds");

  const query: Record<string, unknown> = {
    state: "active",
    visibility: "public",
    deletedAt: null,
  };

  if (minRent || maxRent) {
    const rentQuery: Record<string, number> = {};
    if (minRent) rentQuery.$gte = Number(minRent);
    if (maxRent) rentQuery.$lte = Number(maxRent);
    query.askingRent = rentQuery;
  }

  if (search) {
    query.$or = [
      { headline: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  const [total, rawListings] = await Promise.all([
    Listing.countDocuments(query),
    Listing.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
  ]);

  if (rawListings.length === 0) {
    return NextResponse.json({
      listings: [],
      total: 0,
      page,
      limit,
      totalPages: 0,
    });
  }

  const propertyIds = [...new Set(rawListings.map((l) => String(l.propertyId)))];
  const unitIds = [...new Set(rawListings.map((l) => String(l.unitId)))];
  const listingIds = [...new Set(rawListings.map((l) => String(l._id)))];

  const [properties, units, publishers] = await Promise.all([
    Property.find({ _id: { $in: propertyIds }, deletedAt: null }).lean(),
    Unit.find({ _id: { $in: unitIds }, deletedAt: null }).lean(),
    ListingPublisher.find({
      listingId: { $in: listingIds },
      state: "active",
    }).lean(),
  ]);

  const propertyMap = new Map(properties.map((p) => [String(p._id), p]));
  const unitMap = new Map(units.map((u) => [String(u._id), u]));
  const publisherMap = new Map(publishers.map((pub) => [String(pub.listingId), pub]));

  let projected = rawListings.map((listing) => {
    const property = propertyMap.get(String(listing.propertyId)) || {};
    const unit = unitMap.get(String(listing.unitId)) || {};
    const publisher = publisherMap.get(String(listing._id)) || null;

    return toPublicListingProjection(listing as any, property, unit, publisher);
  });

  if (county) {
    const cLower = county.toLowerCase();
    projected = projected.filter((item) => item.property.location.toLowerCase().includes(cLower));
  }

  if (propertyType) {
    const tLower = propertyType.toLowerCase();
    projected = projected.filter((item) => item.property.type.toLowerCase() === tLower);
  }

  if (beds !== null && beds !== undefined && beds !== "") {
    const bedCount = Number(beds);
    projected = projected.filter((item) => item.unit.beds === bedCount);
  }

  const totalPages = Math.ceil(total / limit);

  return NextResponse.json({
    listings: projected,
    total,
    page,
    limit,
    totalPages,
  });
}
