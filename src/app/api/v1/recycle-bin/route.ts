import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { requirePermission } from "@/lib/permissions";
import { countDeleted, isRecycleBinType, listDeleted } from "@/lib/recycle-bin";

/**
 * GET /api/v1/recycle-bin             → soft-deleted counts per type
 * GET /api/v1/recycle-bin?type=<type> → paginated list of one type's deleted records
 *
 * System-admin only.
 */
export async function GET(request: NextRequest) {
  const authError = await requirePermission(request, "recycle-bin:manage");
  if (authError) return authError;

  await connectToDatabase();

  const type = request.nextUrl.searchParams.get("type");
  if (!type) {
    return NextResponse.json({ data: await countDeleted() });
  }

  if (!isRecycleBinType(type)) {
    return NextResponse.json({ error: "Unknown recycle-bin type" }, { status: 400 });
  }

  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const { docs, total } = await listDeleted(type, page, limit);
  return NextResponse.json(buildPaginationResult(docs, total, page, limit));
}
