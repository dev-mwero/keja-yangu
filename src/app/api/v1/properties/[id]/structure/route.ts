import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { connectToDatabase } from "@/lib/mongoose";
import { asSoftDeleteModel } from "@/lib/mongoose-soft-delete";
import { authenticate, requirePermission } from "@/lib/permissions";
import { type ExistingUnit, planStructureUpdate, StructureError } from "@/lib/property-structure";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { structureUpdateInput } from "@/lib/schemas/structure";
import { Block } from "@/models/Block";
import { Property } from "@/models/Property";
import { Unit } from "@/models/Unit";
import { User } from "@/models/User";

/**
 * Replace a property's block/floor structure, reconciling its units.
 *
 * Unlike the create flow this never rebuilds units from scratch: existing unit
 * ids are preserved (move requests and invoices reference them). Blocks/floors
 * carrying an `id` are edited in place; new ones are created; missing ones are
 * removed — but only when every unit they hold is vacant.
 */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 10 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid property id" }, { status: 400 });
  }

  await connectToDatabase();
  const property = await Property.findById(id).lean();
  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  const authError = await requirePermission(request, "property:edit", { resource: property });
  if (authError) return authError;

  const authUser = authenticate(request);
  const body = await request.json().catch(() => null);
  const parsed = structureUpdateInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid structure payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existingBlocks = (property.blocks ?? []) as unknown as Parameters<
    typeof planStructureUpdate
  >[0]["existingBlocks"];

  const unitDocs = await Unit.find({ propertyId: id, deletedAt: null })
    .select("blockId floorId name letter status tenantId")
    .lean();

  const existingUnits: ExistingUnit[] = unitDocs.map((unit) => ({
    _id: unit._id,
    blockId: String(unit.blockId ?? ""),
    floorId: String(unit.floorId ?? ""),
    name: String(unit.name ?? ""),
    letter: String(unit.letter ?? ""),
    status: String(unit.status ?? "available"),
    tenantId: Array.isArray(unit.tenantId)
      ? unit.tenantId.map(String)
      : unit.tenantId
        ? [String(unit.tenantId)]
        : [],
  }));

  let plan: ReturnType<typeof planStructureUpdate>;
  try {
    plan = planStructureUpdate({
      propertyId: id,
      ownerId: String(property.ownerId),
      existingBlocks,
      existingUnits,
      specs: parsed.data.blocks,
    });
  } catch (error) {
    if (error instanceof StructureError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  // Apply unit deletions first, then creates/updates, so a failed write leaves a
  // recoverable state (units without a matching pending structure are harmless).
  if (plan.unitDeletes.length > 0) {
    await asSoftDeleteModel(Unit).softDeleteMany({ _id: { $in: plan.unitDeletes } });
  }

  if (plan.unitUpdates.length > 0) {
    await Unit.bulkWrite(
      plan.unitUpdates.map((update) => ({
        updateOne: {
          filter: { _id: update.id },
          update: {
            $set: {
              blockId: update.blockId,
              blockName: update.blockName,
              floorId: update.floorId,
              floorLevel: update.floorLevel,
              floorLabel: update.floorLabel,
              spanFloors: update.spanFloors,
              secondaryFloorId: update.secondaryFloorId,
              secondaryFloorLevel: update.secondaryFloorLevel,
            },
          },
        },
      })),
    );
  }

  if (plan.unitCreates.length > 0) {
    await Unit.insertMany(plan.unitCreates, { ordered: false });
  }

  // Phase 2: sync standalone Block collection with plan.blocks
  const activeEmbeddedIds = plan.blocks.map((b) => String(b._id));
  await Block.updateMany(
    { propertyId: id, legacyEmbeddedId: { $nin: activeEmbeddedIds }, deletedAt: null },
    { $set: { deletedAt: new Date() } },
  );

  if (plan.blocks.length > 0) {
    await Block.bulkWrite(
      plan.blocks.map((b) => ({
        updateOne: {
          filter: { propertyId: id, legacyEmbeddedId: String(b._id) },
          update: {
            $set: {
              propertyId: id,
              name: b.name,
              order: b.order,
              rentOverride: b.rentOverride ?? null,
              purpose: b.purpose ?? null,
              duplex: b.duplex ?? false,
              legacyEmbeddedId: String(b._id),
              deletedAt: null,
            },
          },
          upsert: true,
        },
      })),
    );
  }

  const updated = await Property.findByIdAndUpdate(
    id,
    { blocks: plan.blocks },
    { new: true, runValidators: true },
  ).lean();

  if (authUser) {
    try {
      const actorDoc = await User.findById(authUser.userId).select("role").lean();
      await writeAuditEvent({
        actor: { userId: authUser.userId, role: String(actorDoc?.role ?? "unknown") },
        action: "property.structure.update",
        entityType: "Property",
        entityId: id,
        before: { unitCount: existingUnits.length },
        after: {
          unitsCreated: plan.unitCreates.length,
          unitsUpdated: plan.unitUpdates.length,
          unitsDeleted: plan.unitDeletes.length,
          totalUnits: existingUnits.length - plan.unitDeletes.length + plan.unitCreates.length,
        },
        request: {
          ip: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
        },
      });
    } catch (error) {
      console.error("Structure audit failed", error);
      return NextResponse.json(
        { error: "Audit unavailable; structure update aborted" },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    data: updated,
    summary: {
      unitsCreated: plan.unitCreates.length,
      unitsUpdated: plan.unitUpdates.length,
      unitsDeleted: plan.unitDeletes.length,
    },
  });
}
