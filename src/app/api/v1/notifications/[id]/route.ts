import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate, requirePermission } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { Notification, serializeNotification } from "@/models/Notification";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 20 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const authError = await requirePermission(request, "notification:read-own");
  if (authError) return authError;

  const auth = authenticate(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid notification id" }, { status: 400 });
  }

  await connectToDatabase();

  // Only the recipient may read their own row; marking an already-read row is
  // idempotent (200), never a conflict.
  const updated = await Notification.findOneAndUpdate(
    { _id: id, recipientUserId: auth.userId },
    { $set: { readAt: new Date() } },
    { new: true },
  ).lean();
  if (!updated) {
    return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  }

  return NextResponse.json({ data: serializeNotification(updated) });
}
