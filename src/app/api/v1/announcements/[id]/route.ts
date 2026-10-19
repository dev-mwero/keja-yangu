import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveDashboardActor } from "@/app/api/v1/_helpers";
import { connectToDatabase } from "@/lib/mongoose";
import { requirePermission } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { Announcement } from "@/models/Announcement";

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 20 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid announcement id" }, { status: 400 });
  }

  await connectToDatabase();
  const actor = await resolveDashboardActor(request);
  if (actor instanceof NextResponse) return actor;

  const announcement = await Announcement.findById(id).lean();
  if (!announcement) {
    return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
  }

  const authError = await requirePermission(
    request,
    "announcement:manage",
    actor.role === "caretaker" ? { resource: { ownerId: announcement.ownerId } } : undefined,
  );
  if (authError) return authError;

  // Owners manage the whole portfolio; caretakers only their own postings, and
  // only while the posting is still inside a property they are assigned to.
  const canDelete =
    actor.role === "system-admin" ||
    (actor.role === "owner" && announcement.ownerId === actor.userId) ||
    (actor.role === "caretaker" &&
      announcement.ownerId === actor.managedByOwnerId &&
      announcement.authorId === actor.userId &&
      (!announcement.propertyId || actor.assignedPropertyIds.includes(announcement.propertyId)));
  if (!canDelete) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Re-scope the write to the ownership checked above so a concurrent re-scope
  // cannot widen the delete to a row the actor no longer owns.
  await Announcement.deleteOne({ _id: id, ownerId: announcement.ownerId });

  console.info(
    `[announcements] delete actor=${actor.userId} role=${actor.role} announcement=${id}`,
  );

  return NextResponse.json({ data: { _id: id } });
}
