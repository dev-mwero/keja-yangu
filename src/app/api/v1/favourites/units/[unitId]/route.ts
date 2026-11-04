import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate, requireAuth } from "@/lib/permissions";
import { UnitFavorite } from "@/models/UnitFavorite";

interface RouteContext {
  params: Promise<{ unitId: string }>;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const authUser = authenticate(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { unitId } = await context.params;
  if (!isValidObjectId(unitId)) {
    return NextResponse.json({ error: "Invalid unit id" }, { status: 400 });
  }

  await connectToDatabase();

  await UnitFavorite.deleteOne({ userId: authUser.userId, unitId });

  return NextResponse.json({ data: { unitId, favourited: false } });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const authUser = authenticate(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { unitId } = await context.params;
  if (!isValidObjectId(unitId)) {
    return NextResponse.json({ error: "Invalid unit id" }, { status: 400 });
  }

  await connectToDatabase();

  const existing = await UnitFavorite.findOne({
    userId: authUser.userId,
    unitId,
  })
    .select("_id")
    .lean();

  return NextResponse.json({ data: { unitId, favourited: !!existing } });
}
