import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/permissions";
import { PropertyTypeError, updatePropertyType } from "@/lib/property-type-store";

const propertyTypeUpdate = z.object({
  label: z.string().trim().min(1).optional(),
  order: z.coerce.number().int().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid property type id" }, { status: 400 });
  }

  const authError = await requirePermission(request, "property-type:manage");
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  const parsed = propertyTypeUpdate.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid property type payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const updated = await updatePropertyType(id, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: "Property type not found" }, { status: 404 });
    }
    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof PropertyTypeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
