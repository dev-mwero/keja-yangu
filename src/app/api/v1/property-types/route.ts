import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/permissions";
import {
  createPropertyType,
  listPropertyTypes,
  PropertyTypeError,
} from "@/lib/property-type-store";

export async function GET(request: NextRequest) {
  const includeInactive = request.nextUrl.searchParams.get("all") === "1";
  if (includeInactive) {
    const authError = await requirePermission(request, "property-type:manage");
    if (authError) return authError;
  }

  const types = await listPropertyTypes({ includeInactive });
  return NextResponse.json({ data: types });
}

export async function POST(request: NextRequest) {
  const authError = await requirePermission(request, "property-type:manage");
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  const parsed = z
    .object({
      label: z.string().trim().min(1),
      key: z.string().trim().optional(),
    })
    .safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid property type payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const created = await createPropertyType(parsed.data);
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    if (error instanceof PropertyTypeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
