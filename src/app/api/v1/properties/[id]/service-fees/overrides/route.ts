import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readJsonBody } from "@/app/api/v1/_helpers";
import {
  loadManagedProperty,
  validatePropertyUnitIds,
} from "@/app/api/v1/_service-fees";
import { unitServiceFeeOverrideInput } from "@/lib/schemas";
import { ServiceFeeItem } from "@/models/ServiceFeeItem";
import { UnitServiceFeeOverride } from "@/models/UnitServiceFeeOverride";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const property = await loadManagedProperty(request, id);
  if (property instanceof NextResponse) return property;

  const body = await readJsonBody(request);
  const parsed = unitServiceFeeOverrideInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid override payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { unitId, overrides } = parsed.data;
  const unitError = await validatePropertyUnitIds(id, [unitId]);
  if (unitError) return unitError;

  const itemIds = [...new Set(overrides.map((override) => override.itemId))];
  const items = await ServiceFeeItem.find({ _id: { $in: itemIds }, propertyId: id })
    .select("_id")
    .lean();
  if (items.length !== itemIds.length) {
    return NextResponse.json(
      { error: "One or more fee items do not belong to this property" },
      { status: 400 },
    );
  }

  for (const override of overrides) {
    const hasValue = override.amount != null || override.active != null;
    if (!hasValue) {
      await UnitServiceFeeOverride.deleteOne({ itemId: override.itemId, unitId });
      continue;
    }
    await UnitServiceFeeOverride.findOneAndUpdate(
      { itemId: override.itemId, unitId },
      {
        $set: {
          ownerId: property.ownerId,
          propertyId: id,
          itemId: override.itemId,
          unitId,
          amount: override.amount ?? null,
          active: override.active ?? null,
        },
      },
      { upsert: true, new: true, runValidators: true },
    );
  }

  const saved = await UnitServiceFeeOverride.find({ unitId })
    .sort({ itemId: 1 })
    .lean();
  return NextResponse.json({ data: saved });
}
