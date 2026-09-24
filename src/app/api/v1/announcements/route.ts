import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { propertyTitleMap, readJsonBody, resolveDashboardActor } from "@/app/api/v1/_helpers";
import { serializeAnnouncement } from "@/lib/announcements";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { requirePermission } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { announcementInput } from "@/lib/schemas";
import { Announcement } from "@/models/Announcement";
import { Property } from "@/models/Property";
import { User } from "@/models/User";

export async function GET(request: NextRequest) {
  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const skip = (page - 1) * limit;

  const authError = await requirePermission(request, "announcement:read");
  if (authError) return authError;

  await connectToDatabase();
  const actor = await resolveDashboardActor(request);
  if (actor instanceof NextResponse) return actor;

  const filter: Record<string, unknown> = {};
  if (actor.role === "tenant") {
    if (actor.tenantPropertyIds.length === 0) {
      return NextResponse.json(buildPaginationResult([], 0, page, limit));
    }
    // Property-scoped postings plus portfolio-wide postings pinned to the
    // tenant's OWN owners (a bare `propertyId:""` filter would leak every
    // owner's portfolio announcements to every tenant).
    filter.$or = [
      { propertyId: { $in: actor.tenantPropertyIds } },
      { propertyId: "", ownerId: { $in: actor.tenantOwnerIds } },
    ];
    filter.audience = { $in: ["all", "tenants"] };
  } else if (actor.role === "owner") {
    filter.ownerId = actor.userId;
  } else if (actor.role === "caretaker") {
    filter.ownerId = actor.managedByOwnerId;
    filter.propertyId = { $in: actor.assignedPropertyIds };
  }

  const [announcements, total] = await Promise.all([
    Announcement.find(filter).sort({ pinned: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    Announcement.countDocuments(filter),
  ]);
  const titles = await propertyTitleMap(
    announcements.map((announcement) => announcement.propertyId),
  );

  return NextResponse.json(
    buildPaginationResult(
      announcements.map((announcement) => serializeAnnouncement(announcement, titles)),
      total,
      page,
      limit,
    ),
  );
}

export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 10 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  // Caretakers create announcements for the owner they manage: permission
  // resolves the ownerId from the actor and checks the manage_announcements
  // privilege against it (owners and system-admins pass without a resource).
  await connectToDatabase();
  const actor = await resolveDashboardActor(request);
  if (actor instanceof NextResponse) return actor;

  const authError = await requirePermission(
    request,
    "announcement:manage",
    actor.role === "caretaker" ? { resource: { ownerId: actor.managedByOwnerId } } : undefined,
  );
  if (authError) return authError;

  const body = await readJsonBody(request);
  const parsed = announcementInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid announcement payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const propertyId = parsed.data.propertyId ?? "";
  if (actor.role === "caretaker" && propertyId && !actor.assignedPropertyIds.includes(propertyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (propertyId && actor.role === "owner") {
    const property = await Property.findById(propertyId).select("ownerId").lean();
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }
    if (property.ownerId !== actor.userId) {
      return NextResponse.json(
        { error: "You do not have access to this property" },
        { status: 403 },
      );
    }
  }

  const author = await User.findById(actor.userId).select("name").lean();
  const announcement = await Announcement.create({
    title: parsed.data.title,
    body: parsed.data.body,
    authorId: actor.userId,
    authorName: author?.name ?? "",
    ownerId: actor.role === "caretaker" ? actor.managedByOwnerId : actor.userId,
    propertyId,
    pinned: parsed.data.pinned,
    audience: parsed.data.audience,
  });

  const created = await Announcement.findById(String(announcement._id)).lean();
  if (!created) {
    return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
  }
  const titles = await propertyTitleMap([created.propertyId]);

  console.info(
    `[announcements] create actor=${actor.userId} role=${actor.role} announcement=${String(announcement._id)}`,
  );

  return NextResponse.json({ data: serializeAnnouncement(created, titles) }, { status: 201 });
}
