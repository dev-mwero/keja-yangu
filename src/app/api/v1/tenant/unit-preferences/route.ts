import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate, requirePermission } from "@/lib/permissions";
import { UnitPreference } from "@/models/UnitPreference";

/** List the signed-in tenant's live unit preferences. */
export async function GET(request: NextRequest) {
  await connectToDatabase();
  const authError = await requirePermission(request, "unit:prefer");
  if (authError) return authError;

  const auth = authenticate(request);
  const userId = auth?.userId ?? "";

  const preferences = await UnitPreference.find({ userId, deletedAt: null }).lean();

  return NextResponse.json({ data: preferences });
}
