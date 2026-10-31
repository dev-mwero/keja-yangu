import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate, requirePermission } from "@/lib/permissions";
import { Property } from "@/models/Property";
import { Unit } from "@/models/Unit";

export interface ManagedProperty {
  _id: unknown;
  ownerId: string;
  caretakerIds?: string[];
}

export interface ManagedUnit {
  _id: unknown;
  ownerId: string;
  propertyId: string;
}

/**
 * Loads a property and verifies the actor may manage its service fees. Owners
 * and custodians are scoped by owner; caretakers must both hold `manage_units`
 * and be assigned to this specific property.
 */
export async function loadManagedProperty(
  request: NextRequest,
  propertyId: string,
): Promise<ManagedProperty | NextResponse> {
  if (!isValidObjectId(propertyId)) {
    return NextResponse.json({ error: "Invalid property id" }, { status: 400 });
  }

  await connectToDatabase();
  const property = await Property.findOne({ _id: propertyId, deletedAt: null }).lean();
  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  const authError = await requirePermission(request, "unit:manage", { resource: property });
  if (authError) return authError;

  const actor = authenticate(request);
  if (actor?.role === "caretaker" && !(property.caretakerIds ?? []).includes(actor.userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return property;
}

export async function loadManagedUnit(
  request: NextRequest,
  unitId: string,
): Promise<{ unit: ManagedUnit; property: ManagedProperty } | NextResponse> {
  if (!isValidObjectId(unitId)) {
    return NextResponse.json({ error: "Invalid unit id" }, { status: 400 });
  }

  await connectToDatabase();
  const unit = await Unit.findOne({ _id: unitId, deletedAt: null }).lean();
  if (!unit) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  const property = await loadManagedProperty(request, String(unit.propertyId));
  if (property instanceof NextResponse) return property;
  if (String(unit.ownerId) !== String(property.ownerId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { unit, property };
}

/** Validates that every requested unit id belongs to the property and is live. */
export async function validatePropertyUnitIds(
  propertyId: string,
  unitIds: string[],
): Promise<NextResponse | null> {
  const uniqueIds = [...new Set(unitIds)];
  if (uniqueIds.length === 0) return null;
  const found = await Unit.find({
    _id: { $in: uniqueIds },
    propertyId,
    deletedAt: null,
  })
    .select("_id")
    .lean();
  if (found.length !== uniqueIds.length) {
    return NextResponse.json(
      { error: "One or more selected units do not belong to this property" },
      { status: 400 },
    );
  }
  return null;
}
