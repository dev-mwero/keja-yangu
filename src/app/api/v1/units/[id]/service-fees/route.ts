import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { loadManagedUnit } from "@/app/api/v1/_service-fees";
import { loadServiceFeeForUnit } from "@/lib/service-fees";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const managed = await loadManagedUnit(request, id);
  if (managed instanceof NextResponse) return managed;

  const fee = await loadServiceFeeForUnit(id);
  if (!fee) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  return NextResponse.json({ data: fee });
}
