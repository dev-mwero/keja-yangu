import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate, requirePermission } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { Notification } from "@/models/Notification";

export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 20 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const authError = await requirePermission(request, "notification:read-own");
  if (authError) return authError;

  const auth = authenticate(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();

  const result = await Notification.updateMany(
    { recipientUserId: auth.userId, readAt: null },
    { $set: { readAt: new Date() } },
  );

  return NextResponse.json({ data: { modifiedCount: result.modifiedCount } });
}
