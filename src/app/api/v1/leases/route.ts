import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readJsonBody } from "@/app/api/v1/_helpers";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { getTenantScope, requirePermission } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { leaseInput } from "@/lib/schemas";
import { Lease } from "@/models/Lease";
import { Property } from "@/models/Property";
import { Tenant } from "@/models/Tenant";

const LEASE_SAFE_FIELDS =
  "tenantId propertyId ownerId rentAmount frequency startDate endDate status notes createdAt updatedAt";

export async function GET(request: NextRequest) {
  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const skip = (page - 1) * limit;
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status");
  const tenantId = searchParams.get("tenantId");
  const propertyId = searchParams.get("propertyId");

  await connectToDatabase();

  const authError = await requirePermission(request, "lease:manage");
  if (authError) return authError;

  const scope = await getTenantScope(request);
  if (scope instanceof NextResponse) return scope;

  const filter: Record<string, unknown> = { ...scope.filter };
  if (status) filter.status = status;
  if (tenantId) filter.tenantId = tenantId;
  if (propertyId) filter.propertyId = propertyId;

  const [leases, total] = await Promise.all([
    Lease.find(filter)
      .select(LEASE_SAFE_FIELDS)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Lease.countDocuments(filter),
  ]);

  return NextResponse.json(buildPaginationResult(leases, total, page, limit));
}

export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 20 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const authError = await requirePermission(request, "lease:manage");
  if (authError) return authError;

  const body = await readJsonBody(request);
  const parsed = leaseInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid lease payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const scope = await getTenantScope(request);
  if (scope instanceof NextResponse) return scope;

  await connectToDatabase();

  const property = await Property.findById(parsed.data.propertyId).lean();
  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }
  if (scope.role === "owner" && property.ownerId !== scope.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenant = await Tenant.findById(parsed.data.tenantId).lean();
  if (tenant?.status !== "active") {
    return NextResponse.json({ error: "Tenant not found or not active" }, { status: 400 });
  }
  if (tenant.propertyId !== parsed.data.propertyId) {
    return NextResponse.json(
      { error: "Tenant is not attached to the specified property" },
      { status: 400 },
    );
  }

  const duplicate = await Lease.findOne({ tenantId: parsed.data.tenantId, status: "active" })
    .select("_id")
    .lean();
  if (duplicate) {
    return NextResponse.json({ error: "Tenant already has an active lease" }, { status: 409 });
  }

  const lease = await Lease.create({
    tenantId: parsed.data.tenantId,
    propertyId: parsed.data.propertyId,
    ownerId: property.ownerId,
    rentAmount: parsed.data.rentAmount,
    frequency: parsed.data.frequency,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate,
    status: parsed.data.status,
    notes: parsed.data.notes,
  });
  const created = await Lease.findById(lease._id).select(LEASE_SAFE_FIELDS).lean();

  return NextResponse.json({ data: created }, { status: 201 });
}
