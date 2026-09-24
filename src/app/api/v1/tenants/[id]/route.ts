import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongoose";
import { getTenantScope, requirePermission, tenantMatchesScope } from "@/lib/permissions";
import { Property } from "@/models/Property";
import { TENANT_SAFE_FIELDS, Tenant } from "@/models/Tenant";

const tenantUpdate = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["active", "pending", "rejected"]).optional(),
  propertyId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .optional(),
});

async function loadScopedTenant(request: NextRequest, id: string) {
  const scope = await getTenantScope(request);
  if (scope instanceof NextResponse) return scope;

  await connectToDatabase();
  const tenant = await Tenant.findById(id).select(TENANT_SAFE_FIELDS).lean();
  if (!tenant || !tenantMatchesScope(tenant, scope)) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }
  return { tenant, scope };
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid tenant id" }, { status: 400 });
  }

  const authError = await requirePermission(request, "tenant:manage");
  if (authError) return authError;

  const scoped = await loadScopedTenant(request, id);
  if (scoped instanceof NextResponse) return scoped;

  return NextResponse.json({ data: scoped.tenant });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid tenant id" }, { status: 400 });
  }

  const authError = await requirePermission(request, "tenant:manage");
  if (authError) return authError;

  const scoped = await loadScopedTenant(request, id);
  if (scoped instanceof NextResponse) return scoped;
  const { tenant, scope } = scoped;

  const body = await request.json();
  const parsed = tenantUpdate.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid tenant payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updateData: Record<string, unknown> = {};

  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.email !== undefined) updateData.email = parsed.data.email;
  if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;

  if (parsed.data.status !== undefined) {
    if (scope.role === "caretaker") {
      return NextResponse.json({ error: "Caretakers cannot set tenant status" }, { status: 403 });
    }
    updateData.status = parsed.data.status;
    if (parsed.data.status !== tenant.status) {
      updateData.joinedAt = parsed.data.status === "active" ? new Date() : null;
    }
  }

  if (parsed.data.propertyId !== undefined) {
    const newProperty = await Property.findById(parsed.data.propertyId).lean();
    if (!newProperty) {
      return NextResponse.json({ error: "Property not found" }, { status: 422 });
    }
    if (scope.role === "owner" && newProperty.ownerId !== scope.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (
      scope.role === "caretaker" &&
      (!newProperty.caretakerIds?.includes(scope.userId) ||
        newProperty.ownerId !== scope.managedByOwnerId)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    updateData.propertyId = parsed.data.propertyId;
    updateData.ownerId = newProperty.ownerId;
  }

  const nextPropertyId = parsed.data.propertyId ?? tenant.propertyId;
  const nextEmail = parsed.data.email ?? tenant.email;
  if (nextEmail !== tenant.email || nextPropertyId !== tenant.propertyId) {
    const duplicate = await Tenant.findOne({ propertyId: nextPropertyId, email: nextEmail })
      .select("_id")
      .lean();
    if (duplicate && String(duplicate._id) !== id) {
      return NextResponse.json(
        { error: "A tenant with this email already exists on this property" },
        { status: 409 },
      );
    }
  }

  const updated = await Tenant.findOneAndUpdate({ _id: id }, updateData, {
    new: true,
    runValidators: true,
  })
    .select(TENANT_SAFE_FIELDS)
    .lean();
  if (!updated) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  return NextResponse.json({ data: updated });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid tenant id" }, { status: 400 });
  }

  const authError = await requirePermission(request, "tenant:manage");
  if (authError) return authError;

  const scoped = await loadScopedTenant(request, id);
  if (scoped instanceof NextResponse) return scoped;

  await Tenant.deleteOne({ _id: id });

  return NextResponse.json({ message: "Tenant deleted" });
}
