import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { parsePagination } from "@/lib/pagination";
import { authenticate } from "@/lib/permissions";
import { BrokerAuthorization } from "@/models/BrokerAuthorization";
import { BrokerProfile } from "@/models/BrokerProfile";
import { Listing } from "@/models/Listing";
import { ListingPublisher } from "@/models/ListingPublisher";
import { Property } from "@/models/Property";
import { Unit } from "@/models/Unit";

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  const profile = (await BrokerProfile.findOne({ userId: auth.userId }).lean()) as any;
  if (!profile || profile.status !== "verified") {
    return NextResponse.json(
      { error: "Forbidden: Verified broker profile required" },
      { status: 403 },
    );
  }

  // Get all active authorizations for this broker
  const authorizations = (await BrokerAuthorization.find({
    brokerId: auth.userId,
    status: "active",
  }).lean()) as any[];

  if (authorizations.length === 0) {
    return NextResponse.json({ listings: [], total: 0 });
  }

  // Gather propertyIds, blockIds, unitIds from authorizations
  const propertyIds = new Set<string>();
  const blockIds = new Set<string>();
  const unitIds = new Set<string>();

  for (const authItem of authorizations) {
    if (authItem.scopeType === "property") {
      propertyIds.add(authItem.propertyId);
    } else if (authItem.scopeType === "block") {
      blockIds.add(authItem.scopeId);
    } else if (authItem.scopeType === "unit") {
      unitIds.add(authItem.scopeId);
    }
  }

  const queryOr: any[] = [];
  if (propertyIds.size > 0) queryOr.push({ propertyId: { $in: [...propertyIds] } });
  if (blockIds.size > 0) queryOr.push({ blockId: { $in: [...blockIds] } });
  if (unitIds.size > 0) queryOr.push({ unitId: { $in: [...unitIds] } });

  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const skip = (page - 1) * limit;

  const listingFilter = {
    state: "active",
    deletedAt: null,
    $or: queryOr,
  };

  const [total, listings] = await Promise.all([
    Listing.countDocuments(listingFilter),
    Listing.find(listingFilter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
  ]);

  // Fetch publishers for this broker on these listings
  const listingIds = listings.map((l: any) => String(l._id));
  const publishers = (await ListingPublisher.find({
    listingId: { $in: listingIds },
    publisherUserId: auth.userId,
    publisherRole: "broker",
    state: "active",
  }).lean()) as any[];

  const publisherMap = new Map<string, any>();
  for (const p of publishers) {
    publisherMap.set(p.listingId, p);
  }

  // Fetch properties and units to provide readable context
  const pIds = [...new Set(listings.map((l: any) => l.propertyId))];
  const uIds = [...new Set(listings.map((l: any) => l.unitId))];

  const [properties, units] = await Promise.all([
    Property.find({ _id: { $in: pIds } })
      .select("title name location county")
      .lean(),
    Unit.find({ _id: { $in: uIds } })
      .select("unitNumber beds baths rent")
      .lean(),
  ]);

  const propertyMap = new Map(properties.map((p: any) => [String(p._id), p]));
  const unitMap = new Map(units.map((u: any) => [String(u._id), u]));

  const enriched = listings.map((l: any) => {
    const pub = publisherMap.get(String(l._id));
    const prop = propertyMap.get(String(l.propertyId));
    const un = unitMap.get(String(l.unitId));

    return {
      id: String(l._id),
      headline: l.headline,
      askingRent: l.askingRent,
      serviceCharge: l.serviceCharge,
      property: {
        id: l.propertyId,
        title: prop?.title || prop?.name || "Property",
        location: prop?.location || prop?.county || "",
      },
      unit: {
        id: l.unitId,
        unitNumber: un?.unitNumber || "",
        beds: un?.beds ?? 0,
        baths: un?.baths ?? 0,
      },
      published: Boolean(pub),
      shareCode: pub?.shareCode || null,
      shareUrl: pub?.shareCode ? `/marketplace/${l._id}?ref=${pub.shareCode}` : null,
    };
  });

  return NextResponse.json({
    listings: enriched,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  });
}
