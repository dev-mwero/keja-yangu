import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveTenantActor, resolveTenantIds } from "@/app/api/v1/_helpers";
import { serializeInvoice } from "@/lib/invoicing";
import { connectToDatabase } from "@/lib/mongoose";
import { notifyOverdueInvoices } from "@/lib/notifications";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { hasDarajaCredentials } from "@/lib/payments/owner-config";
import { paystackConfigured } from "@/lib/payments/paystack";
import { requirePermission } from "@/lib/permissions";
import { Invoice } from "@/models/Invoice";
import { OwnerPaymentConfig } from "@/models/OwnerPaymentConfig";

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

  if (status === "overdue") {
    await notifyOverdueInvoices(now, { tenantId: { $in: tenantIds } });
  }

  const [invoices, total] = await Promise.all([
    Invoice.find(filter).sort({ issuedAt: -1 }).skip(skip).limit(limit).lean(),
    Invoice.countDocuments(filter),
  ]);

  // Availability is per-invoice because M-Pesa collection is per owner (their
  // own Daraja shortcode) while Paystack is platform-wide. One config lookup
  // per distinct owner in the page, not one per row.
  const paystackOn = paystackConfigured();
  const ownerIds = [...new Set(invoices.map((doc) => String(doc.ownerId)))];
  const ownerConfigs = ownerIds.length
    ? await OwnerPaymentConfig.find({ ownerId: { $in: ownerIds }, darajaEnabled: true }).lean()
    : [];
  const mpesaOwnerIds = new Set(
    ownerConfigs.filter(hasDarajaCredentials).map((doc) => String(doc.ownerId)),
  );

  return NextResponse.json(
    buildPaginationResult(
      invoices.map((doc) => ({
        ...serializeInvoice(doc, now),
        online: {
          paystack: paystackOn,
          mpesa: mpesaOwnerIds.has(String(doc.ownerId)),
        },
      })),
      total,
      page,
      limit,
    ),
  );
}
