import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate, requireAuth } from "@/lib/permissions";
import { Property } from "@/models/Property";
import { PropertyView } from "@/models/PropertyView";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Records the most recent time the authenticated user viewed a property.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const authUser = authenticate(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid property id" }, { status: 400 });
  }

  await connectToDatabase();

  const property = await Property.findOne({
    _id: id,
    status: "available",
    published: true,
    deletedAt: null,
  })
    .select("_id")
    .lean();
  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  const viewedAt = new Date();
  try {
    await PropertyView.updateOne(
      { userId: authUser.userId, propertyId: id },
      { $set: { viewedAt } },
      { upsert: true },
    );
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      await PropertyView.updateOne(
        { userId: authUser.userId, propertyId: id },
        { $set: { viewedAt } },
      );
    } else {
      throw error;
    }
  }

  return NextResponse.json({ data: { propertyId: id, viewed: true } });
}
