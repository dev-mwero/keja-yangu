import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readJsonBody, resolveInvoiceActor } from "@/app/api/v1/_helpers";
import { canMarkPaid, serializeInvoice } from "@/lib/invoicing";
import { connectToDatabase } from "@/lib/mongoose";
import { requirePermission } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { invoiceMarkPaidInput } from "@/lib/schemas";
import { Invoice } from "@/models/Invoice";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 20 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid invoice id" }, { status: 400 });
  }

  await connectToDatabase();
  const invoice = await Invoice.findById(id).lean();
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const authError = await requirePermission(request, "invoice:mark-paid", { resource: invoice });
  if (authError) return authError;

  const actor = await resolveInvoiceActor(request);
  if (actor instanceof NextResponse) return actor;

  if (actor.role === "caretaker" && !actor.assignedPropertyIds.includes(invoice.propertyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    paidBy: actor.userId,
    paidByRole: actor.role,
  };
  if (parsed.data.method !== undefined) updateData.method = parsed.data.method;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;

  const updated = await Invoice.findOneAndUpdate({ _id: id }, updateData, {
    new: true,
    runValidators: true,
  }).lean();
  if (!updated) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  console.info(`[invoicing] mark-paid actor=${actor.userId} role=${actor.role} invoice=${id}`);

  return NextResponse.json({ data: serializeInvoice(updated, now) });
}
