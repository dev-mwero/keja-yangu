import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { authenticate, requireAuth } from "@/lib/permissions";
import { Property } from "@/models/Property";
import { PropertyFavorite } from "@/models/PropertyFavorite";

const favouriteToggleInput = z.object({
  propertyId: z
    .string()
    .trim()
    .refine(isValidObjectId, { message: "A valid property id is required" }),
});

export async function GET(request: NextRequest) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const skip = (page - 1) * limit;

  await connectToDatabase();
  const authUser = authenticate(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [favourites, total] = await Promise.all([
    PropertyFavorite.find({ userId: authUser.userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PropertyFavorite.countDocuments({ userId: authUser.userId }),
  ]);

  const propertyIds = favourites.map((f) => String(f.propertyId));
  const properties =
    propertyIds.length > 0
      ? await Property.find({
          _id: { $in: propertyIds },
          deletedAt: null,
        })
          .select("-ownerId -caretakerIds -createdById -__v")
          .lean()
      : [];
  const propertyById = new Map(properties.map((p) => [String(p._id), p]));

  const data = favourites
    .map((f) => {
      const property = propertyById.get(String(f.propertyId));
      if (!property) return null;
      return {
        ...property,
        favouritedAt: f.createdAt,
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
  const parsed = favouriteToggleInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid favourite payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { propertyId } = parsed.data;

  await connectToDatabase();

  // Only published, available properties can be favourited.
  const property = await Property.findOne({
    _id: propertyId,
    status: "available",
    published: true,
    deletedAt: null,
  })
    .select("_id")
    .lean();
  if (!property) {
    return NextResponse.json(
      { error: "Property not found or not available for favouriting" },
      { status: 404 },
    );
  }

  const existing = await PropertyFavorite.findOne({
    userId: authUser.userId,
    propertyId,
  }).lean();

  let favourited: boolean;
  if (existing) {
    await PropertyFavorite.deleteOne({ _id: existing._id });
    favourited = false;
  } else {
    try {
      await PropertyFavorite.create({
        userId: authUser.userId,
        propertyId,
      });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
        return NextResponse.json({ data: { propertyId, favourited: true } });
      }
      throw error;
    }
    favourited = true;
  }

  return NextResponse.json({ data: { propertyId, favourited } });
}
