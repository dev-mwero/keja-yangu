import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import {
  assignBillingAccountToUnit,
  getOrCreateBillingAccountForOwner,
  resolveBillingAccountForUnit,
} from "@/lib/billing-accounts";
import { transitionListingState, validateListingPublish } from "@/lib/listings";
import { getManagedOwnerId } from "@/lib/managed-owner";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate } from "@/lib/permissions";
import { Lease } from "@/models/Lease";
import { Listing } from "@/models/Listing";
import { ListingPublisher } from "@/models/ListingPublisher";
import { ManagementAssignment } from "@/models/ManagementAssignment";
import { Property } from "@/models/Property";
import { Unit } from "@/models/Unit";
import { User } from "@/models/User";

async function verifyListingAccess(
  user: { _id: unknown; role: string },
  propertyId: string,
): Promise<boolean> {
  if (user.role === "system-admin") return true;

  const userId = String(user._id);
  const property = await Property.findOne({
    _id: propertyId,
    deletedAt: null,
  }).lean();
  if (!property) return false;

  if (property.ownerId === userId) return true;

  if (user.role === "admin") {
    const assignment = await ManagementAssignment.findOne({
      principalUserId: userId,
      propertyId,
      accessRole: "admin",
      status: "active",
    }).lean();
    return Boolean(assignment);
  }

  if (user.role === "caretaker") {
    const managedByOwnerId = await getManagedOwnerId(userId);
    if (!managedByOwnerId || property.ownerId !== managedByOwnerId) return false;
    const assignment = await ManagementAssignment.findOne({
      principalUserId: userId,
      propertyId,
      accessRole: "caretaker",
      status: "active",
    }).lean();
    return Boolean(assignment);
  }

  return false;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role isActive").lean();
  if (
    !user?.isActive ||
    (user.role !== "admin" &&
      user.role !== "owner" &&
      user.role !== "system-admin" &&
      user.role !== "caretaker")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const listing = await Listing.findOne({ _id: id, deletedAt: null }).lean();
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const hasAccess = await verifyListingAccess(user, listing.propertyId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [unit, property, publishers] = await Promise.all([
    Unit.findById(listing.unitId).lean(),
    Property.findById(listing.propertyId).lean(),
    ListingPublisher.find({ listingId: id, state: "active" }).lean(),
  ]);

  return NextResponse.json({
    listing,
    unit,
    property,
    publishers,
  });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role isActive").lean();
  if (
    !user?.isActive ||
    (user.role !== "admin" &&
      user.role !== "owner" &&
      user.role !== "system-admin" &&
      user.role !== "caretaker")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const listing = await Listing.findOne({ _id: id, deletedAt: null }).lean();
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const hasAccess = await verifyListingAccess(user, listing.propertyId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { action, reason } = body;
  const userId = String(user._id);

  if (action) {
    if (action === "publish") {
      const unit = await Unit.findById(listing.unitId).lean();
      if (!unit) {
        return NextResponse.json({ error: "Unit not found" }, { status: 404 });
      }

      const [activeLeaseCount, resolvedAccount] = await Promise.all([
        Lease.countDocuments({
          unitId: listing.unitId,
          status: "active",
        }),
        resolveBillingAccountForUnit(listing.unitId),
      ]);

      // A publishable unit needs an active billing account. Provision one for
      // the unit owner on first publish instead of failing with a dead end for
      // properties created before billing backfill ran.
      let billingAccountId = resolvedAccount
        ? String((resolvedAccount as { _id?: unknown })._id ?? "")
        : "";
      if (!billingAccountId) {
        const ownerId =
          (unit.ownerId as string | undefined) ||
          ((await Property.findById(listing.propertyId).select("ownerId").lean())?.ownerId as
            | string
            | undefined);
        if (ownerId) {
          const created = await getOrCreateBillingAccountForOwner(ownerId);
          billingAccountId = String((created as { _id?: unknown })._id ?? "");
          if (billingAccountId) {
            await assignBillingAccountToUnit(
              listing.unitId,
              billingAccountId,
              userId,
              "Auto-provisioned when publishing listing",
            );
          }
        }
      }

      const validation = validateListingPublish({ ...unit, billingAccountId }, listing, {
        activeLeaseCount,
      });

      if (!validation.valid) {
        return NextResponse.json(
          { error: "Validation failed", details: validation.errors },
          { status: 422 },
        );
      }

      const updated = await transitionListingState({
        listingId: id,
        newState: "active",
        actorId: userId,
        actorRole: user.role,
        reason: reason || "Published by staff",
      });

      return NextResponse.json({ listing: updated });
    }

    if (action === "pause") {
      const updated = await transitionListingState({
        listingId: id,
        newState: "paused",
        actorId: userId,
        actorRole: user.role,
        reason: reason || "Paused by staff",
      });
      return NextResponse.json({ listing: updated });
    }

    if (action === "resume") {
      const updated = await transitionListingState({
        listingId: id,
        newState: "active",
        actorId: userId,
        actorRole: user.role,
        reason: reason || "Resumed by staff",
      });
      return NextResponse.json({ listing: updated });
    }

    if (action === "withdraw") {
      const updated = await transitionListingState({
        listingId: id,
        newState: "withdrawn",
        actorId: userId,
        actorRole: user.role,
        reason: reason || "Withdrawn by staff",
      });
      return NextResponse.json({ listing: updated });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  // General field updates
  const allowedFields = [
    "headline",
    "description",
    "askingRent",
    "serviceCharge",
    "depositMonths",
    "availableFrom",
    "minimumStayMonths",
    "amenities",
    "media",
    "visibility",
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const updatedListing = await Listing.findOneAndUpdate(
    { _id: id, version: listing.version },
    {
      $set: updates,
      $inc: { version: 1 },
    },
    { new: true },
  );

  if (!updatedListing) {
    return NextResponse.json(
      { error: "Conflict: listing was modified concurrently" },
      { status: 409 },
    );
  }

  await writeAuditEvent({
    actor: {
      userId,
      role: user.role,
    },
    action: "listing.updated",
    entityType: "listing",
    entityId: id,
    scope: {
      propertyId: listing.propertyId,
      blockId: listing.blockId,
      unitId: listing.unitId,
    },
    before: { version: listing.version },
    after: { ...updates, version: updatedListing.version },
  });

  return NextResponse.json({ listing: updatedListing });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role isActive").lean();
  if (
    !user?.isActive ||
    (user.role !== "admin" &&
      user.role !== "owner" &&
      user.role !== "system-admin" &&
      user.role !== "caretaker")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const listing = await Listing.findOne({ _id: id, deletedAt: null }).lean();
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const hasAccess = await verifyListingAccess(user, listing.propertyId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = String(user._id);

  await Listing.updateOne(
    { _id: id },
    {
      $set: {
        deletedAt: new Date(),
        state: "withdrawn",
      },
      $inc: { version: 1 },
    },
  );

  await writeAuditEvent({
    actor: {
      userId,
      role: user.role,
    },
    action: "listing.deleted",
    entityType: "listing",
    entityId: id,
    scope: {
      propertyId: listing.propertyId,
      blockId: listing.blockId,
      unitId: listing.unitId,
    },
    before: { state: listing.state },
    after: { state: "withdrawn", deletedAt: true },
  });

  return NextResponse.json({ success: true, message: "Listing deleted" });
}
