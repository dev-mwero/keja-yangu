import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { asSoftDeleteModel } from "@/lib/mongoose-soft-delete";
import { requirePermission } from "@/lib/permissions";
import { type ExistingUnit, planStructureUpdate, StructureError } from "@/lib/property-structure";
import { structureUpdateInput } from "@/lib/schemas/structure";
import { Property } from "@/models/Property";
import { Unit } from "@/models/Unit";

/**
 * Replace a property's block/floor structure, reconciling its units.
 *
 * Unlike the create flow this never rebuilds units from scratch: existing unit
 * ids are preserved (move requests and invoices reference them). Blocks/floors
 * carrying an `id` are edited in place; new ones are created; missing ones are
 * removed — but only when every unit they hold is vacant.
 */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
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
    tenantId: unit.tenantId ? String(unit.tenantId) : "",
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
            },
          },
        },
      })),
    );
  }

  if (plan.unitCreates.length > 0) {
    await Unit.insertMany(plan.unitCreates);
  }

  const updated = await Property.findByIdAndUpdate(
    id,
    { blocks: plan.blocks },
    { new: true, runValidators: true },
  ).lean();

  return NextResponse.json({
    data: updated,
    summary: {
      unitsCreated: plan.unitCreates.length,
      unitsUpdated: plan.unitUpdates.length,
      unitsDeleted: plan.unitDeletes.length,
    },
  });
}
