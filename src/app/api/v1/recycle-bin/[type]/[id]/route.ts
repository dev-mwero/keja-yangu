import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { requirePermission } from "@/lib/permissions";
import { isRecycleBinType, purgeDeleted } from "@/lib/recycle-bin";

/**
 * DELETE /api/v1/recycle-bin/:type/:id — permanently purge a soft-deleted
 * record. Live records are never matched, so this cannot delete something that
 * was not first soft-deleted.
 */
export async function DELETE(
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

  const purged = await purgeDeleted(type, id);
  if (!purged) {
    return NextResponse.json({ error: "Deleted record not found" }, { status: 404 });
  }

  return NextResponse.json({ data: { type, _id: id, purged: true } });
}
