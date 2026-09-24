import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { authenticate, requirePermission } from "@/lib/permissions";
import { notificationsQuery } from "@/lib/schemas";
import { Notification, serializeNotification } from "@/models/Notification";

export async function GET(request: NextRequest) {
  const authError = await requirePermission(request, "notification:read-own");
  if (authError) return authError;

  const auth = authenticate(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = request.nextUrl.searchParams;
  const { page, limit } = parsePagination({
    page: searchParams.get("page") ?? undefined,
    limit: searchParams.get("limit") ?? "20",
  });
  const skip = (page - 1) * limit;
  const unread = searchParams.get("unread");

  const parsed = notificationsQuery.safeParse({
    type: searchParams.get("type"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const type = parsed.data.type;

  const filter: Record<string, unknown> = { recipientUserId: auth.userId };
  if (unread === "true") filter.readAt = null;
  if (type) filter.type = type;

  await connectToDatabase();

  const [items, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(filter),
  ]);

  return NextResponse.json(
    buildPaginationResult(
      items.map((doc) => serializeNotification(doc)),
      total,
      page,
      limit,
    ),
  );
}
