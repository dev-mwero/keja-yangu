import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { generateListingShareCode } from "@/lib/listings";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { authenticate } from "@/lib/permissions";
import { Listing } from "@/models/Listing";
import { ListingPublisher } from "@/models/ListingPublisher";
import { ManagementAssignment } from "@/models/ManagementAssignment";
import { Property } from "@/models/Property";
import { Unit } from "@/models/Unit";
import { User } from "@/models/User";

async function getAuthorizedPropertyIds(user: {
  _id: unknown;
  role: string;
}): Promise<string[] | null> {
  const role = user.role;
  if (role === "system-admin") return null;

  const userId = String(user._id);
  const ownedProps = await Property.find({ ownerId: userId }).select("_id").lean();
  const propIds = new Set<string>(ownedProps.map((p) => String(p._id)));

  if (role === "admin") {
    const assignments = await ManagementAssignment.find({
      principalUserId: userId,
      accessRole: "admin",
      status: "active",
    })
      .select("propertyId")
      .lean();
    for (const a of assignments) {
      if (a.propertyId) propIds.add(String(a.propertyId));
    }
  }

  return [...propIds];
}

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role isActive").lean();
  if (
    !user?.isActive ||
    (user.role !== "admin" && user.role !== "owner" && user.role !== "system-admin")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const skip = (page - 1) * limit;

  const authorizedPropertyIds = await getAuthorizedPropertyIds(user);
  const filter: Record<string, unknown> = { deletedAt: null };

  const paramPropertyId = request.nextUrl.searchParams.get("propertyId");
  const paramUnitId = request.nextUrl.searchParams.get("unitId");
  const paramState = request.nextUrl.searchParams.get("state");

  if (authorizedPropertyIds !== null) {
    if (paramPropertyId) {
      if (!authorizedPropertyIds.includes(paramPropertyId)) {
        return NextResponse.json(buildPaginationResult([], 0, page, limit));
      }
      filter.propertyId = paramPropertyId;
    } else {
      if (authorizedPropertyIds.length === 0) {
        return NextResponse.json(buildPaginationResult([], 0, page, limit));
      }
      filter.propertyId = { $in: authorizedPropertyIds };
    }
  } else if (paramPropertyId) {
    filter.propertyId = paramPropertyId;
  }

  if (paramUnitId) {
    filter.unitId = paramUnitId;
  }

  if (paramState) {
    filter.state = paramState;
  }

  const [total, listings] = await Promise.all([
    Listing.countDocuments(filter),
    Listing.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
  ]);

  return NextResponse.json(buildPaginationResult(listings, total, page, limit));
}

export async function POST(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role isActive").lean();
  if (
    !user?.isActive ||
    (user.role !== "admin" && user.role !== "owner" && user.role !== "system-admin")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const {
    propertyId,
    blockId,
    unitId,
    headline,
    description,
    askingRent,
    serviceCharge,
    depositMonths,
    availableFrom,
    minimumStayMonths,
    amenities,
    media,
    visibility,
  } = body;

  if (!propertyId || !unitId || !headline || askingRent === undefined) {
    return NextResponse.json(
      {
        error: "propertyId, unitId, headline, and askingRent are required",
      },
      { status: 400 },
    );
  }

  if (typeof askingRent !== "number" || askingRent <= 0) {
    return NextResponse.json(
      { error: "askingRent must be a number greater than 0" },
      { status: 400 },
    );
  }

  // Authorization check on property
  const authorizedPropertyIds = await getAuthorizedPropertyIds(user);
  if (authorizedPropertyIds !== null && !authorizedPropertyIds.includes(propertyId)) {
    return NextResponse.json({ error: "Forbidden: No access to this property" }, { status: 403 });
  }

  // Check unit existence
  const unit = await Unit.findOne({
    _id: unitId,
    propertyId,
    deletedAt: null,
  }).lean();
  if (!unit) {
    return NextResponse.json({ error: "Unit not found in property" }, { status: 404 });
  }

  // Check unique in-flight listing
  const existingListing = await Listing.findOne({
    unitId,
    state: { $in: ["draft", "active", "paused", "let"] },
    deletedAt: null,
  }).lean();

  if (existingListing) {
    return NextResponse.json(
      {
        error: "An active or draft listing already exists for this unit",
      },
      { status: 409 },
    );
  }

  const userId = String(user._id);

  const listing = await Listing.create({
    propertyId,
    blockId: blockId || unit.blockId || "",
    unitId,
    state: "draft",
    headline: headline.trim(),
    description: (description || "").trim(),
    askingRent,
    serviceCharge: serviceCharge ?? unit.serviceCharge ?? 0,
    depositMonths: depositMonths ?? 1,
    availableFrom: availableFrom ? new Date(availableFrom) : new Date(),
    minimumStayMonths: minimumStayMonths ?? 1,
    amenities: Array.isArray(amenities) ? amenities : [],
    media: Array.isArray(media) ? media : [],
    visibility: visibility || "public",
    canonicalPublisherUserId: userId,
    createdByUserId: userId,
  });

  const shareCode = generateListingShareCode(userId, String(listing._id));

  const publisher = await ListingPublisher.create({
    listingId: String(listing._id),
    publisherUserId: userId,
    publisherRole: user.role === "admin" ? "admin" : "admin",
    shareCode,
    state: "active",
    startsAt: new Date(),
    createdByUserId: userId,
  });

  return NextResponse.json(
    {
      listing,
      publisher: {
        shareCode: publisher.shareCode,
        publisherRole: publisher.publisherRole,
      },
    },
    { status: 201 },
  );
}
