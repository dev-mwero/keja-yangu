/**
 * Property claim routes — Phase 2 Canonical Inventory
 *
 * POST /api/v1/properties/[id]/claim
 *   Admin submits a claim asserting authority over an existing property.
 *   Creates a `PropertyClaim` with status "pending" for system-admin review.
 *
 * GET /api/v1/properties/[id]/claim
 *   System-admin lists all claims for a property.
 */

import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate } from "@/lib/permissions";
import { createPropertyClaim } from "@/lib/property-identity";
import { Property } from "@/models/Property";
import { PropertyClaim } from "@/models/PropertyClaim";
import { User } from "@/models/User";

const claimInput = z.object({
  evidence: z.string().trim().min(1, "evidence is required"),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid property id" }, { status: 400 });
  }

  await connectToDatabase();

  const authUser = authenticate(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await User.findById(authUser.userId).select("role isActive").lean();
  if (!user?.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admins may submit property claims.
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const property = await Property.findOne({ _id: id, deletedAt: null }).select("_id title").lean();
  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = claimInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Prevent duplicate pending/approved claims from the same user for this property.
  const existingClaim = await PropertyClaim.findOne({
    propertyId: id,
    claimantUserId: authUser.userId,
    status: { $in: ["pending", "approved"] },
  })
    .select("_id status")
    .lean();

  if (existingClaim) {
    return NextResponse.json(
      { error: "You already have an active claim for this property" },
      { status: 409 },
    );
  }

  const claim = await createPropertyClaim(authUser.userId, id, parsed.data.evidence);

  return NextResponse.json({ data: claim }, { status: 201 });
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid property id" }, { status: 400 });
  }

  await connectToDatabase();

  const authUser = authenticate(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await User.findById(authUser.userId).select("role isActive").lean();
  if (!user?.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only system-admins may list all claims.
  if (user.role !== "system-admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = request.nextUrl.searchParams.get("status");
  const filter: Record<string, unknown> = { propertyId: id };
  if (status) filter.status = status;

  const claims = await PropertyClaim.find(filter).sort({ createdAt: -1 }).lean();

  return NextResponse.json({ data: claims });
}
