import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticate, requireAuth } from "@/lib/permissions";
import { connectToDatabase } from "@/lib/mongoose";
import { PropertyFavorite } from "@/models/PropertyFavorite";

interface RouteContext {
  params: Promise<{ propertyId: string }>;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const authUser = authenticate(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { propertyId } = await context.params;
  if (!isValidObjectId(propertyId)) {
    return NextResponse.json({ error: "Invalid property id" }, { status: 400 });
  }

  await connectToDatabase();

  await PropertyFavorite.deleteOne({ userId: authUser.userId, propertyId });

  return NextResponse.json({ data: { propertyId, favourited: false } });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const authUser = authenticate(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { propertyId } = await context.params;
  if (!isValidObjectId(propertyId)) {
    return NextResponse.json({ error: "Invalid property id" }, { status: 400 });
  }

  await connectToDatabase();

  const existing = await PropertyFavorite.findOne({
    userId: authUser.userId,
    propertyId,
  })
    .select("_id")
    .lean();

  return NextResponse.json({ data: { propertyId, favourited: !!existing } });
}
