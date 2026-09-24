import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readJsonBody } from "@/app/api/v1/_helpers";
import { connectToDatabase } from "@/lib/mongoose";
import { getTenantScope, requirePermission } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { leaseUpdate } from "@/lib/schemas";
import { Invoice } from "@/models/Invoice";
import { Lease } from "@/models/Lease";

const LEASE_SAFE_FIELDS =
  "tenantId propertyId ownerId rentAmount frequency startDate endDate status notes createdAt updatedAt";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid lease id" }, { status: 400 });
  }

  const authError = await requirePermission(request, "lease:manage");
  if (authError) return authError;

  await connectToDatabase();

  const scope = await getTenantScope(request);
  if (scope instanceof NextResponse) return scope;

  const lease = await Lease.findById(id).select(LEASE_SAFE_FIELDS).lean();
  if (!lease) {
    return NextResponse.json({ error: "Lease not found" }, { status: 404 });
  }
  if (scope.role === "owner" && lease.ownerId !== scope.userId) {
    return NextResponse.json({ error: "Lease not found" }, { status: 404 });
  }

  return NextResponse.json({ data: lease });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 20 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid lease id" }, { status: 400 });
  }

  await connectToDatabase();
  const lease = await Lease.findById(id).lean();
  if (!lease) {
    return NextResponse.json({ error: "Lease not found" }, { status: 404 });
  }

  const authError = await requirePermission(request, "lease:manage", { resource: lease });
  if (authError) return authError;

  const body = await readJsonBody(request);
  const parsed = leaseUpdate.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid lease payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.rentAmount !== undefined) updateData.rentAmount = parsed.data.rentAmount;
  if (parsed.data.startDate !== undefined) updateData.startDate = parsed.data.startDate;
  if (parsed.data.endDate !== undefined) updateData.endDate = parsed.data.endDate;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (
    parsed.data.status === "ended" &&
    lease.status === "active" &&
    lease.endDate == null &&
    parsed.data.endDate === undefined
  ) {
    updateData.endDate = new Date();
  }

  const updated = await Lease.findOneAndUpdate({ _id: id }, updateData, {
    new: true,
    runValidators: true,
  })
    .select(LEASE_SAFE_FIELDS)
    .lean();
  if (!updated) {
    return NextResponse.json({ error: "Lease not found" }, { status: 404 });
  }

  return NextResponse.json({ data: updated });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 20 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid lease id" }, { status: 400 });
  }

  await connectToDatabase();
  const lease = await Lease.findById(id).lean();
  if (!lease) {
    return NextResponse.json({ error: "Lease not found" }, { status: 404 });
  }

  const authError = await requirePermission(request, "lease:manage", { resource: lease });
  if (authError) return authError;

  const referenced = await Invoice.exists({ leaseId: id });
  if (referenced) {
    return NextResponse.json(
      { error: "Lease is referenced by invoices and cannot be deleted" },
      { status: 409 },
    );
  }

  await Lease.deleteOne({ _id: id });

  return NextResponse.json({ message: "Lease deleted" });
}
