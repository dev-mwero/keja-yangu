import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  loadManagedProperty,
  validatePropertyUnitIds,
} from "@/app/api/v1/_service-fees";
import { readJsonBody } from "@/app/api/v1/_helpers";
import { serviceFeeItemCreateInput } from "@/lib/schemas";
import { ServiceFeeItem } from "@/models/ServiceFeeItem";
import { UnitServiceFeeOverride } from "@/models/UnitServiceFeeOverride";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const property = await loadManagedProperty(request, id);
  if (property instanceof NextResponse) return property;

  const [items, overrides] = await Promise.all([
    ServiceFeeItem.find({ propertyId: id }).sort({ sortOrder: 1, label: 1 }).lean(),
    UnitServiceFeeOverride.find({ propertyId: id }).sort({ unitId: 1, itemId: 1 }).lean(),
  ]);

  return NextResponse.json({ data: { items, overrides } });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const property = await loadManagedProperty(request, id);
  if (property instanceof NextResponse) return property;

  const body = await readJsonBody(request);
  const parsed = serviceFeeItemCreateInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid service fee payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const appliesTo = parsed.data.appliesTo ?? "all";
  const unitIds = appliesTo === "selected" ? [...new Set(parsed.data.unitIds ?? [])] : [];
  if (appliesTo === "selected") {
    const unitError = await validatePropertyUnitIds(id, unitIds);
    if (unitError) return unitError;
  }

  const item = await ServiceFeeItem.create({
    ownerId: property.ownerId,
    propertyId: id,
    label: parsed.data.label,
    amount: parsed.data.amount,
    active: parsed.data.active ?? true,
    sortOrder: parsed.data.sortOrder ?? 0,
    appliesTo,
    unitIds,
  });

  return NextResponse.json({ data: item.toObject() }, { status: 201 });
}
