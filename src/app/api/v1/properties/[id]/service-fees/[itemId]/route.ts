import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readJsonBody } from "@/app/api/v1/_helpers";
import {
  loadManagedProperty,
  validatePropertyUnitIds,
} from "@/app/api/v1/_service-fees";
import { serviceFeeItemUpdateInput } from "@/lib/schemas";
import { ServiceFeeItem } from "@/models/ServiceFeeItem";

interface RouteContext {
  params: Promise<{ id: string; itemId: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id, itemId } = await context.params;
  const property = await loadManagedProperty(request, id);
  if (property instanceof NextResponse) return property;
  if (!isValidObjectId(itemId)) {
    return NextResponse.json({ error: "Invalid service fee id" }, { status: 400 });
  }

  const item = await ServiceFeeItem.findOne({ _id: itemId, propertyId: id }).lean();
  if (!item) {
    return NextResponse.json({ error: "Service fee not found" }, { status: 404 });
  }

  const body = await readJsonBody(request);
  const parsed = serviceFeeItemUpdateInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid service fee payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const appliesTo = parsed.data.appliesTo ?? (item.appliesTo as "all" | "selected") ?? "all";
  const existingUnitIds = (item.unitIds ?? []) as string[];
  const unitIds =
    appliesTo === "selected"
      ? [...new Set(parsed.data.unitIds ?? existingUnitIds)]
      : [];
  if (appliesTo === "selected") {
    if (unitIds.length === 0) {
      return NextResponse.json(
        {
          error: "Select at least one unit when the fee applies to selected units",
        },
        { status: 400 },
      );
    }
    const unitError = await validatePropertyUnitIds(id, unitIds);
    if (unitError) return unitError;
  }

  const updates = {
    ...parsed.data,
    appliesTo,
    unitIds,
  };
  const updated = await ServiceFeeItem.findOneAndUpdate({ _id: itemId, propertyId: id }, updates, {
    new: true,
    runValidators: true,
  }).lean();
  if (!updated) {
    return NextResponse.json({ error: "Service fee not found" }, { status: 404 });
  }

  return NextResponse.json({ data: updated });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id, itemId } = await context.params;
  const property = await loadManagedProperty(request, id);
  if (property instanceof NextResponse) return property;
  if (!isValidObjectId(itemId)) {
    return NextResponse.json({ error: "Invalid service fee id" }, { status: 400 });
  }

  // Soft-disable so historical invoices (which snapshot item ids) remain
  // meaningful and managers can re-activate the item later.
  const updated = await ServiceFeeItem.findOneAndUpdate(
    { _id: itemId, propertyId: id },
    { $set: { active: false } },
    { new: true },
  ).lean();
  if (!updated) {
    return NextResponse.json({ error: "Service fee not found" }, { status: 404 });
  }

  return NextResponse.json({ data: updated });
}
