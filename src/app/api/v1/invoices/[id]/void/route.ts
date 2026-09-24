import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveInvoiceActor } from "@/app/api/v1/_helpers";
import { canVoid, serializeInvoice } from "@/lib/invoicing";
import { connectToDatabase } from "@/lib/mongoose";
import { requirePermission } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
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

  const authError = await requirePermission(request, "invoice:manage", { resource: invoice });
  if (authError) return authError;

  const actor = await resolveInvoiceActor(request);
  if (actor instanceof NextResponse) return actor;

  if (actor.role === "caretaker" && !actor.assignedPropertyIds.includes(invoice.propertyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (invoice.status === "paid") {
    return NextResponse.json({ error: "Paid invoices cannot be voided" }, { status: 409 });
  }

  if (!canVoid(invoice.status)) {
    console.info(`[invoicing] void actor=${actor.userId} role=${actor.role} invoice=${id}`);
    return NextResponse.json({ data: serializeInvoice(invoice, new Date()) });
  }

  const voidNote = `Voided on ${new Date().toISOString()}`;
  const updateData: Record<string, unknown> = { status: "void" };
  updateData.notes = invoice.notes ? `${invoice.notes}\n${voidNote}` : voidNote;

  const updated = await Invoice.findOneAndUpdate({ _id: id }, updateData, {
    new: true,
    runValidators: true,
  }).lean();
  if (!updated) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  console.info(`[invoicing] void actor=${actor.userId} role=${actor.role} invoice=${id}`);

  return NextResponse.json({ data: serializeInvoice(updated, new Date()) });
}
