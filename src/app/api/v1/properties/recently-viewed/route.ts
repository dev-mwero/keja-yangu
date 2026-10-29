import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate, requireAuth } from "@/lib/permissions";
import { Property } from "@/models/Property";
import { PropertyView } from "@/models/PropertyView";

export async function GET(request: NextRequest) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const authUser = authenticate(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const views = await PropertyView.find({ userId: authUser.userId })
    .sort({ viewedAt: -1 })
    .limit(6)
    .lean();
  const viewedAtByProperty = new Map(views.map((view) => [String(view.propertyId), view.viewedAt]));
  const propertyIds = Array.from(viewedAtByProperty.keys());
  const properties =
    propertyIds.length > 0
      ? await Property.find({
          _id: { $in: propertyIds },
          status: "available",
          published: true,
          deletedAt: null,
        })
          .select("-ownerId -caretakerIds -createdById -__v")
          .lean()
      : [];
  const propertyById = new Map(properties.map((property) => [String(property._id), property]));
  const data = propertyIds
    .map((propertyId) => {
      const property = propertyById.get(propertyId);
      return property ? { ...property, viewedAt: viewedAtByProperty.get(propertyId) } : null;
    })
    .filter((property) => property !== null);

  return NextResponse.json({ data });
}
