import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate, requirePermission } from "@/lib/permissions";
import { Notification } from "@/models/Notification";

export async function GET(request: NextRequest) {
  const authError = await requirePermission(request, "notification:read-own");
  if (authError) return authError;

  const auth = authenticate(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();

  const count = await Notification.countDocuments({
    recipientUserId: auth.userId,
    readAt: null,
  });

  return NextResponse.json({ data: { count } });
}
