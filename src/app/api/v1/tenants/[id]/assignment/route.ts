import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongoose";
import { getTenantScope, requirePermission, tenantMatchesScope } from "@/lib/permissions";
import {
  assignUnitToTenant,
  TenancyError,
  type TenantRef,
  vacateTenantFromUnit,
} from "@/lib/tenancy";
import { TENANT_SAFE_FIELDS, Tenant } from "@/models/Tenant";

const assignInput = z.object({
  unitId: z.string().regex(/^[0-9a-fA-F]{24}$/),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Load a tenant the caller may manage, applying the same scope rules as
 * `/api/v1/tenants/[id]` (owner → own portfolio, caretaker → assigned
 * properties, custodian → managing owner, system-admin → all).
 */
async function loadScopedTenant(request: NextRequest, id: string) {
  const scope = await getTenantScope(request);
  if (scope instanceof NextResponse) return scope;

  await connectToDatabase();
  const tenant =
    ((await Tenant.findById(id).lean()) as TenantRef | null) ??
    ((await Tenant.findOne({ userId: id }).lean()) as TenantRef | null);
  if (!tenant || !tenantMatchesScope(tenant, scope)) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }
  return { tenant, scope };
}

function tenancyError(error: unknown) {
  if (error instanceof TenancyError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  throw error;
}

/** Assign a vacant unit at the tenant's property to the tenant. */
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid tenant id" }, { status: 400 });
  }

  const scoped = await loadScopedTenant(request, id);
  if (scoped instanceof NextResponse) return scoped;
  const { tenant } = scoped;

  const authError = await requirePermission(request, "unit:manage", {
    resource: { ownerId: tenant.ownerId },
  });
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const parsed = assignInput.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid assignment payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { unit } = await assignUnitToTenant({ tenant, unitId: parsed.data.unitId });
    const updated = await Tenant.findById(id).select(TENANT_SAFE_FIELDS).lean();
    return NextResponse.json({
      data: {
        tenant: updated,
        unit: {
          _id: String(unit._id),
          name: unit.name,
          blockName: unit.blockName,
          propertyId: String(unit.propertyId),
        },
      },
    });
  } catch (error) {
    return tenancyError(error);
  }
}

/** Vacate the unit the tenant currently occupies. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid tenant id" }, { status: 400 });
  }

  const scoped = await loadScopedTenant(request, id);
  if (scoped instanceof NextResponse) return scoped;
  const { tenant } = scoped;

  const authError = await requirePermission(request, "unit:manage", {
    resource: { ownerId: tenant.ownerId },
  });
  if (authError) return authError;

  try {
    await vacateTenantFromUnit({ tenant });
    const updated = await Tenant.findById(id).select(TENANT_SAFE_FIELDS).lean();
    return NextResponse.json({ data: { tenant: updated, unit: null } });
  } catch (error) {
    return tenancyError(error);
  }
}
