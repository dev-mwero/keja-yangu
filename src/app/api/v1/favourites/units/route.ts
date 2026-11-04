import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { authenticate, requireAuth } from "@/lib/permissions";
import { Property } from "@/models/Property";
import { Unit } from "@/models/Unit";
import { UnitFavorite } from "@/models/UnitFavorite";

const unitFavouriteToggleInput = z.object({
  unitId: z.string().trim().refine(isValidObjectId, { message: "A valid unit id is required" }),
});

const UNIT_SAFE_FIELDS =
  "propertyId name blockName floorLabel floorLevel status rent beds baths area purpose";
const PROPERTY_SAFE_FIELDS = "title location price images";

export async function GET(request: NextRequest) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const authUser = authenticate(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const skip = (page - 1) * limit;

  await connectToDatabase();

  const [favourites, total] = await Promise.all([
    UnitFavorite.find({ userId: authUser.userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    UnitFavorite.countDocuments({ userId: authUser.userId }),
  ]);

  const unitIds = favourites.map((favourite) => String(favourite.unitId));
  const units =
    unitIds.length > 0
      ? await Unit.find({ _id: { $in: unitIds }, deletedAt: null })
          .select(UNIT_SAFE_FIELDS)
          .lean()
      : [];
  const unitById = new Map(units.map((unit) => [String(unit._id), unit]));

  const propertyIds = [...new Set(units.map((unit) => String(unit.propertyId)))];
  const properties =
    propertyIds.length > 0
      ? await Property.find({
          _id: { $in: propertyIds },
          published: true,
          deletedAt: null,
        })
          .select(PROPERTY_SAFE_FIELDS)
          .lean()
      : [];
  const propertyById = new Map(properties.map((property) => [String(property._id), property]));

  const data = favourites
    .map((favourite) => {
      const unit = unitById.get(String(favourite.unitId));
      if (!unit) return null;
      const property = propertyById.get(String(unit.propertyId));
      if (!property) return null;
      return {
        ...unit,
        property,
        favouritedAt: favourite.createdAt,
      };
    })
    .filter(Boolean);

  return NextResponse.json(buildPaginationResult(data, total, page, limit));
}

export async function POST(request: NextRequest) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const authUser = authenticate(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }
    throw error;
  }

  const parsed = unitFavouriteToggleInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid favourite payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { unitId } = parsed.data;

  await connectToDatabase();

  const unit = await Unit.findById(unitId).select("_id propertyId").lean();
  if (!unit) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  // Any unit on a published property may be saved, regardless of status.
  const property = await Property.findOne({
    _id: unit.propertyId,
    published: true,
    deletedAt: null,
  })
    .select("_id")
    .lean();
  if (!property) {
    return NextResponse.json(
      { error: "Unit not found or not available for favouriting" },
      { status: 404 },
    );
  }

  const existing = await UnitFavorite.findOne({
    userId: authUser.userId,
    unitId,
  }).lean();

  let favourited: boolean;
  if (existing) {
    await UnitFavorite.deleteOne({ _id: existing._id });
    favourited = false;
  } else {
    try {
      await UnitFavorite.create({
        userId: authUser.userId,
        unitId,
        propertyId: String(unit.propertyId),
      });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
        return NextResponse.json({ data: { unitId, favourited: true } });
      }
      throw error;
    }
    favourited = true;
  }

  return NextResponse.json({ data: { unitId, favourited } });
}
