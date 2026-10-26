import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { authenticate } from "@/lib/permissions";
import { Property } from "@/models/Property";
import { Tenant } from "@/models/Tenant";
import { Unit } from "@/models/Unit";
import { User } from "@/models/User";

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const user = await User.findById(auth.userId)
    .select("role isActive managedByOwnerId email")
    .lean();
  if (!user?.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  const role = user.role;

  // For tenants we scope by the tenancy's propertyId (and, when a
  // propertyId is requested, only their own property). This lets a tenant
  // see their occupied unit for a move-out *and* vacant units at their
  // property for a move-in request, without leaking other properties.
  let tenantPropertyIds: string[] | null = null;
  if (role === "tenant") {
    const email = user.email?.trim().toLowerCase() ?? "";
    const tenancyMatch: Record<string, unknown>[] = [{ userId: String(user._id) }];
    if (email) tenancyMatch.push({ email });
    const tenancies = await Tenant.find({ $or: tenancyMatch, deletedAt: null })
      .select("propertyId")
      .lean();
    tenantPropertyIds = [...new Set(tenancies.map((t) => String(t.propertyId)))];
    if (tenantPropertyIds.length === 0) {
      return NextResponse.json(buildPaginationResult([], 0, page, limit));
    }
    filter.propertyId = { $in: tenantPropertyIds };
  } else if (role === "owner") {
    filter.ownerId = String(user._id);
  } else if (role === "custodian") {
    if (!user.managedByOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    filter.ownerId = user.managedByOwnerId;
  } else if (role === "caretaker") {
    if (!user.managedByOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const assigned = await Property.find({ caretakerIds: String(user._id) })
      .select("_id")
      .lean();
    filter.ownerId = user.managedByOwnerId;
    filter.propertyId = { $in: assigned.map((p) => String(p._id)) };
  } else if (role !== "system-admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const propertyId = request.nextUrl.searchParams.get("propertyId");
  const blockId = request.nextUrl.searchParams.get("blockId");
  const status = request.nextUrl.searchParams.get("status");
  const tenantId = request.nextUrl.searchParams.get("tenantId");
  if (propertyId) {
    // A tenant may only narrow to a property they actually tenancy.
    if (role === "tenant") {
      if (!tenantPropertyIds?.includes(propertyId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      filter.propertyId = propertyId;
    } else {
      filter.propertyId = propertyId;
    }
  }
  if (blockId) filter.blockId = blockId;
  if (status) filter.status = status;
  if (tenantId && role !== "tenant") filter.tenantId = { $elemMatch: { $eq: tenantId } };

  const [units, total] = await Promise.all([
    Unit.find(filter)
      .sort({ propertyId: 1, floorLevel: 1, name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Unit.countDocuments(filter),
  ]);

  return NextResponse.json(buildPaginationResult(units, total, page, limit));
}
