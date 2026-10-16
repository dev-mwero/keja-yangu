import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongoose";
import { asSoftDeleteModel } from "@/lib/mongoose-soft-delete";
import { authenticate, requirePermission } from "@/lib/permissions";
import { Tenant } from "@/models/Tenant";
import { Unit } from "@/models/Unit";
import { UnitPreference } from "@/models/UnitPreference";
import { User } from "@/models/User";

const preferInput = z.object({
  note: z.string().trim().max(500).optional(),
});

/** Property ids the tenant currently holds a tenancy for (userId, or email fallback). */
async function tenantPropertyIds(userId: string, email: string): Promise<Set<string>> {
  const or: Record<string, unknown>[] = [{ userId }];
  if (email) or.push({ email });
  const tenancies = await Tenant.find({ $or: or, deletedAt: null }).select("propertyId").lean();
  return new Set(tenancies.map((t) => String(t.propertyId)));
}

/**
 * Mark a vacant unit as the tenant's preferred choice. A tenant may only prefer
 * a unit at a property they tenancy; choosing again replaces the previous pick
 * (one live preference per tenant per property).
 */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid unit id" }, { status: 400 });
  }

  await connectToDatabase();
  const authError = await requirePermission(request, "unit:prefer");
  if (authError) return authError;

  const auth = authenticate(request);
  const userId = auth?.userId ?? "";
  const user = await User.findById(userId).select("email").lean();
  const email = user?.email?.trim().toLowerCase() ?? "";

  const body = await request.json().catch(() => ({}));
  const parsed = preferInput.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid preference payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const unit = await Unit.findById(id).lean();
  if (!unit) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }
  if (unit.status !== "available") {
    return NextResponse.json({ error: "Only vacant units can be preferred" }, { status: 409 });
  }

  const propertyId = String(unit.propertyId);
  const allowed = await tenantPropertyIds(userId, email);
  if (!allowed.has(propertyId)) {
    return NextResponse.json(
      { error: "You can only prefer units at a property you tenancy" },
      { status: 403 },
    );
  }

  const preference = await UnitPreference.findOneAndUpdate(
    { userId, propertyId, deletedAt: null },
    {
      $set: {
        ownerId: String(unit.ownerId),
        unitId: String(unit._id),
        blockId: String(unit.blockId ?? ""),
        blockName: String(unit.blockName ?? ""),
        floorId: String(unit.floorId ?? ""),
        floorLabel: String(unit.floorLabel ?? ""),
        note: parsed.data.note ?? "",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return NextResponse.json({ data: preference });
}

/** Clear the tenant's preference for the unit's property. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid unit id" }, { status: 400 });
  }

  await connectToDatabase();
  const authError = await requirePermission(request, "unit:prefer");
  if (authError) return authError;

  const auth = authenticate(request);
  const userId = auth?.userId ?? "";

  await asSoftDeleteModel(UnitPreference).softDeleteMany({ userId, unitId: id });

  return NextResponse.json({ data: { unitId: id } });
}
