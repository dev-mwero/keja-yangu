import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveTenantActor, resolveTenantIds } from "@/app/api/v1/_helpers";
import { serializeInvoice } from "@/lib/invoicing";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { requirePermission } from "@/lib/permissions";
import { Invoice } from "@/models/Invoice";

export async function GET(request: NextRequest) {
  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const skip = (page - 1) * limit;
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status");
  const period = searchParams.get("period");
  const now = new Date();

  const authError = await requirePermission(request, "invoice:read-own");
  if (authError) return authError;

  const userId = await resolveTenantActor(request);
  if (userId instanceof NextResponse) return userId;

  await connectToDatabase();

  const tenantIds = await resolveTenantIds(userId);
  if (tenantIds.length === 0) {
    return NextResponse.json(buildPaginationResult([], 0, page, limit));
  }

  const filter: Record<string, unknown> = { tenantId: { $in: tenantIds } };
  if (period) filter.period = period;
  if (status === "overdue") {
    filter.status = "pending";
    filter.dueDate = { $lt: now };
  } else if (status) {
    filter.status = status;
  }

  const [invoices, total] = await Promise.all([
    Invoice.find(filter).sort({ issuedAt: -1 }).skip(skip).limit(limit).lean(),
    Invoice.countDocuments(filter),
  ]);

  return NextResponse.json(
    buildPaginationResult(
      invoices.map((doc) => serializeInvoice(doc, now)),
      total,
      page,
      limit,
    ),
  );
}
