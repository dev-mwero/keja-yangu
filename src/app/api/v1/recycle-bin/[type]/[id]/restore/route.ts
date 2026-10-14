import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { requirePermission } from "@/lib/permissions";
import { isRecycleBinType, restoreDeleted } from "@/lib/recycle-bin";

/** POST /api/v1/recycle-bin/:type/:id/restore — restore a soft-deleted record. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ type: string; id: string }> },
) {
  const { type, id } = await context.params;

  const authError = await requirePermission(request, "recycle-bin:manage");
  if (authError) return authError;

  if (!isRecycleBinType(type)) {
    return NextResponse.json({ error: "Unknown recycle-bin type" }, { status: 400 });
  }
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid record id" }, { status: 400 });
  }

  await connectToDatabase();

  const restored = await restoreDeleted(type, id);
  if (!restored) {
    return NextResponse.json({ error: "Deleted record not found" }, { status: 404 });
  }

  return NextResponse.json({ data: { type, _id: id } });
}
