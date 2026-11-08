import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { type Action, authenticate, getStaffAssignmentScope } from "@/lib/permissions";
import { ManagementAssignment } from "@/models/ManagementAssignment";
import { Tenant } from "@/models/Tenant";
import { Unit } from "@/models/Unit";
import { User } from "@/models/User";

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role isActive email").lean();
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
  let caretakerAssignedPropertyIds: string[] | null = null;

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
  } else if (role === "admin") {
    const now = new Date();
    const assignments = await ManagementAssignment.find({
      principalUserId: String(user._id),
      accessRole: "admin",
      status: "active",
    }).lean();
    const activeReadAssignments = assignments.filter(
      (assignment) =>
        assignment.permissions.includes("unit:read") &&
        (!assignment.startsAt || assignment.startsAt <= now) &&
        (!assignment.endsAt || assignment.endsAt > now),
    );
    const propertyIds = [
      ...new Set(
        activeReadAssignments
          .filter((assignment) => assignment.scopeType === "property")
          .map((assignment) => assignment.propertyId),
      ),
    ];
    const blockIds = [
      ...new Set(
        activeReadAssignments
          .filter((assignment) => assignment.scopeType === "block" && assignment.blockId)
          .map((assignment) => assignment.blockId),
      ),
    ];
    const unitIds = [
      ...new Set(
        activeReadAssignments
          .filter((assignment) => assignment.scopeType === "unit" && assignment.unitId)
          .map((assignment) => assignment.unitId),
      ),
    ];
    const scopeQueries: Record<string, unknown>[] = [];
    if (propertyIds.length > 0) scopeQueries.push({ propertyId: { $in: propertyIds } });
    if (blockIds.length > 0) scopeQueries.push({ blockId: { $in: blockIds } });
    if (unitIds.length > 0) scopeQueries.push({ _id: { $in: unitIds } });
    if (scopeQueries.length === 0) {
      return NextResponse.json(buildPaginationResult([], 0, page, limit));
    }
    filter.$or = scopeQueries;
  } else if (role === "custodian" || role === "caretaker") {
    // Assignment-only scoping: un-backfilled staff see nothing.
    const staffScope = await getStaffAssignmentScope(
      String(user._id),
      role,
      "unit:read" as unknown as Action,
    );
    if (!staffScope.hasAssignments) {
      return NextResponse.json(buildPaginationResult([], 0, page, limit));
    }
    const scopeQueries: Record<string, unknown>[] = [];
    if (staffScope.propertyScopeIds.length > 0) {
      scopeQueries.push({ propertyId: { $in: staffScope.propertyScopeIds } });
    }
    if (staffScope.assignedBlockIds.length > 0) {
      scopeQueries.push({ blockId: { $in: staffScope.assignedBlockIds } });
    }
    if (staffScope.assignedUnitIds.length > 0) {
      scopeQueries.push({ _id: { $in: staffScope.assignedUnitIds } });
    }
    if (scopeQueries.length === 0) {
      return NextResponse.json(buildPaginationResult([], 0, page, limit));
    }
    filter.$or = scopeQueries;
    caretakerAssignedPropertyIds = staffScope.assignedPropertyIds;
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
      if (role === "caretaker" && !caretakerAssignedPropertyIds?.includes(propertyId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
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
