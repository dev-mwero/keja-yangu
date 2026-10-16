import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { authenticate } from "@/lib/permissions";
import { moveRequestCreateInput } from "@/lib/schemas/move-request";
import { MoveRequest } from "@/models/MoveRequest";
import { Property } from "@/models/Property";
import { Tenant } from "@/models/Tenant";
import { User } from "@/models/User";

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role isActive managedByOwnerId").lean();
  if (!user?.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  const role = user.role;
  if (role === "tenant") {
    filter.requestedById = String(user._id);
  } else if (role === "owner") {
    filter.ownerId = String(user._id);
  } else if (role === "custodian") {
    if (!user.managedByOwnerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    filter.ownerId = user.managedByOwnerId;
  } else if (role === "caretaker") {
    if (!user.managedByOwnerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const assigned = await Property.find({
      caretakerIds: String(user._id),
      ownerId: user.managedByOwnerId,
    })
      .select("_id")
      .lean();
    filter.ownerId = user.managedByOwnerId;
    filter.propertyId = { $in: assigned.map((p) => String(p._id)) };
  } else if (role !== "system-admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = request.nextUrl.searchParams.get("status");
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    MoveRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    MoveRequest.countDocuments(filter),
  ]);

  // Resolve property titles and requester names so the dashboard table can
  // show which unit/property each request belongs to without N+1 lookups.
  const propertyIds = [...new Set(items.map((m) => String(m.propertyId)).filter(Boolean))];
  const requesterIds = [
    ...new Set(
      items.map((m) => String(m.requestedById)).filter((id) => id && id !== String(user._id)),
    ),
  ];
  const [properties, requesters] = await Promise.all([
    propertyIds.length
      ? Property.find({ _id: { $in: propertyIds } })
          .select("title")
          .lean()
      : Promise.resolve([]),
    requesterIds.length
      ? User.find({ _id: { $in: requesterIds } })
          .select("name email")
          .lean()
      : Promise.resolve([]),
  ]);
  const propertyTitleById = new Map(properties.map((p) => [String(p._id), String(p.title ?? "")]));
  const requesterNameById = new Map(
    requesters.map((r) => [String(r._id), String(r.name ?? r.email ?? "")]),
  );

  const enriched = items.map((m) => ({
    ...m,
    propertyTitle: propertyTitleById.get(String(m.propertyId)) ?? "",
    requestedByName: requesterNameById.get(String(m.requestedById)) ?? "",
  }));

  return NextResponse.json(buildPaginationResult(enriched, total, page, limit));
}

export async function POST(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = moveRequestCreateInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid move request payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectToDatabase();
  const user = await User.findById(auth.userId)
    .select("role isActive managedByOwnerId email")
    .lean();
  if (!user?.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const property = await Property.findById(parsed.data.propertyId).select("_id ownerId").lean();
  if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });

  const role = user.role;
  const actorId = String(user._id);

  if (role === "tenant") {
    // Prefer the bound tenancy, then fall back to an email match and heal
    // the link so future lookups (units, payments, etc.) resolve directly.
    let tenant = await Tenant.findOne({ userId: actorId, propertyId: parsed.data.propertyId })
      .select("_id")
      .lean();
    if (!tenant && user.email) {
      tenant = await Tenant.findOne({
        email: user.email.trim().toLowerCase(),
        propertyId: parsed.data.propertyId,
      })
        .select("_id")
        .lean();
      if (tenant) {
        await Tenant.updateOne({ _id: tenant._id }, { $set: { userId: actorId } });
      }
    }
    if (!tenant) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const created = await MoveRequest.create({
      ...parsed.data,
      ownerId: property.ownerId,
      requestedById: actorId,
      requestedByRole: role,
      tenantId: parsed.data.tenantId ?? String(tenant._id),
      status: "pending",
    });
    return NextResponse.json({ data: created }, { status: 201 });
  }

  const scopeOwnerId =
    role === "system-admin" ? property.ownerId : role === "owner" ? actorId : user.managedByOwnerId;
  if (!scopeOwnerId || property.ownerId !== scopeOwnerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const created = await MoveRequest.create({
    ...parsed.data,
    ownerId: property.ownerId,
    requestedById: actorId,
    requestedByRole: role,
    status: "pending",
  });
  return NextResponse.json({ data: created }, { status: 201 });
}
