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

  // Staff see internal-safe audiences ("all", "staff") plus anything they
  // authored, so a "tenants only" note never vanishes from its author's list.
  const staffAudience = [{ audience: { $in: ["all", "staff"] } }, { authorId: actor.userId }];
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
    filter.$or = staffAudience;
  } else if (actor.role === "caretaker") {
    filter.ownerId = actor.managedByOwnerId;
    // Assigned properties plus the owner's portfolio-wide postings.
    filter.$and = [
      { $or: [{ propertyId: { $in: actor.assignedPropertyIds } }, { propertyId: "" }] },
      { $or: staffAudience },
    ];
  } else if (actor.role === "custodian") {
    // Owner-delegate: the whole portfolio of the owner they manage.
    filter.ownerId = actor.managedByOwnerId;
    filter.$or = staffAudience;
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

  // Caretakers and custodians publish for the owner they manage: the
  // permission check resolves the ownerId from the actor for caretakers
  // (owners and system-admins pass without a resource), and the create below
  // stamps `ownerId` with that managing owner.
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
  // The portfolio the post belongs to: the actor's own for owners/admins, the
  // managing owner's for caretakers/custodians (a delegation).
  const portfolioOwnerId =
    actor.role === "caretaker" || actor.role === "custodian"
      ? actor.managedByOwnerId
      : actor.userId;
  if (actor.role === "caretaker" && propertyId && !actor.assignedPropertyIds.includes(propertyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (propertyId && (actor.role === "owner" || actor.role === "custodian")) {
    const property = await Property.findById(propertyId).select("ownerId").lean();
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }
    if (property.ownerId !== portfolioOwnerId) {
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
    ownerId: portfolioOwnerId,
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
