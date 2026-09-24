import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readJsonBody, resolveTenantActor, resolveTenantIds } from "@/app/api/v1/_helpers";
import { canMarkPaid, serializeInvoice } from "@/lib/invoicing";
import { connectToDatabase } from "@/lib/mongoose";
import { notifyInvoicePaid } from "@/lib/notifications";
import { requirePermission } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { invoiceMarkPaidInput } from "@/lib/schemas";
import { Invoice } from "@/models/Invoice";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid invoice id" }, { status: 400 });
  }

  const authError = await requirePermission(request, "invoice:read-own");
  if (authError) return authError;

  const userId = await resolveTenantActor(request);
  if (userId instanceof NextResponse) return userId;

  await connectToDatabase();

  const tenantIds = await resolveTenantIds(userId);
  const invoice = await Invoice.findOne({ _id: id, tenantId: { $in: tenantIds } }).lean();
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  return NextResponse.json({ data: serializeInvoice(invoice, new Date()) });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 20 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid invoice id" }, { status: 400 });
  }

  const authError = await requirePermission(request, "invoice:read-own");
  if (authError) return authError;

  const userId = await resolveTenantActor(request);
  if (userId instanceof NextResponse) return userId;

  await connectToDatabase();

  const tenantIds = await resolveTenantIds(userId);
  const invoice = await Invoice.findOne({ _id: id, tenantId: { $in: tenantIds } }).lean();
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (!canMarkPaid(invoice.status)) {
    return NextResponse.json(
      { error: invoice.status === "paid" ? "Invoice is already paid" : "Invoice is void" },
      { status: 409 },
    );
  }

  const body = await readJsonBody(request);
  const parsed = invoiceMarkPaidInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payment payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const now = new Date();
  const updateData: Record<string, unknown> = {
    status: "paid",
    amountPaid: invoice.amountDue,
    paidAt: now,
    paidBy: userId,
    paidByRole: "tenant",
  };
  if (parsed.data.method !== undefined) updateData.method = parsed.data.method;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;

  const updated = await Invoice.findOneAndUpdate(
    { _id: id, status: { $in: ["pending", "draft"] } },
    updateData,
    {
      new: true,
      runValidators: true,
    },
  ).lean();
  if (!updated) {
    // A concurrent writer (e.g. the Paystack webhook) settled the invoice
    // between our read and this conditional update — never overwrite it.
    return NextResponse.json({ error: "Invoice is already paid or voided" }, { status: 409 });
  }

  console.info(`[invoicing] mark-paid actor=${userId} role=tenant invoice=${id}`);

  await notifyInvoicePaid(updated);

  return NextResponse.json({ data: serializeInvoice(updated, now) });
}
