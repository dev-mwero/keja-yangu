import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { requireAuth, requirePermission } from "@/lib/permissions";
import { Property } from "@/models/Property";
import { Unit } from "@/models/Unit";

/**
 * Live unit counts for a property, by status. Powers the occupancy strip on the
 * structure page, which shows the *saved* let/vacant split alongside the
 * live structure preview. Soft-deleted units are excluded by the plugin.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid property id" }, { status: 400 });
  }

  await connectToDatabase();
  const property = await Property.findById(id).lean();
  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  const authError = await requireAuth(request, ["owner", "caretaker", "custodian", "system-admin"]);
  if (authError) return authError;

  // Tenants are permitted `unit:read` (to browse vacancies at their own
  // property) but must not read counts for an arbitrary property, so the role
  // gate above excludes them before the ownership check below.
  const permissionError = await requirePermission(request, "unit:read", { resource: property });
  if (permissionError) return permissionError;

  const [occupied, vacant, maintenance] = await Promise.all([
    Unit.countDocuments({ propertyId: id, status: "occupied" }),
    Unit.countDocuments({ propertyId: id, status: "available" }),
    Unit.countDocuments({ propertyId: id, status: "maintenance" }),
  ]);

  return NextResponse.json({
    data: { total: occupied + vacant + maintenance, occupied, vacant, maintenance },
  });
}
