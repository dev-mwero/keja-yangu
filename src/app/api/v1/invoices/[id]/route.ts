import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { type InvoiceActor, readJsonBody, resolveInvoiceActor } from "@/app/api/v1/_helpers";
import { canDelete, serializeInvoice } from "@/lib/invoicing";
import { connectToDatabase } from "@/lib/mongoose";
import { requirePermission } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { invoiceUpdate } from "@/lib/schemas";
import { Invoice } from "@/models/Invoice";

function invoiceInScope(
  doc: { ownerId: string; propertyId: string },
  actor: InvoiceActor,
): boolean {
  if (actor.role === "system-admin") return true;
  if (actor.role === "owner") return doc.ownerId === actor.userId;
  if (actor.role === "caretaker") {
    return (
      doc.ownerId === actor.managedByOwnerId && actor.assignedPropertyIds.includes(doc.propertyId)
    );
  }
  return false;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid invoice id" }, { status: 400 });
  }

  const authError = await requirePermission(request, "invoice:read");
  if (authError) return authError;

  await connectToDatabase();

  const actor = await resolveInvoiceActor(request);
  if (actor instanceof NextResponse) return actor;

  const invoice = await Invoice.findById(id).lean();
  if (!invoice || !invoiceInScope(invoice, actor)) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  return NextResponse.json({ data: serializeInvoice(invoice, new Date()) });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
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

  if (invoice.status === "paid" || invoice.status === "void") {
    return NextResponse.json({ error: "Paid or void invoices cannot be edited" }, { status: 409 });
  }

  const body = await readJsonBody(request);
  const parsed = invoiceUpdate.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid invoice payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.amountDue !== undefined) updateData.amountDue = parsed.data.amountDue;
  if (parsed.data.method !== undefined) updateData.method = parsed.data.method;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;

  const updated = await Invoice.findOneAndUpdate({ _id: id }, updateData, {
    new: true,
    runValidators: true,
  }).lean();
  if (!updated) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  return NextResponse.json({ data: serializeInvoice(updated, new Date()) });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
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

  if (!canDelete(invoice.status)) {
    return NextResponse.json({ error: "Only draft invoices can be deleted" }, { status: 409 });
  }

  await Invoice.deleteOne({ _id: id });

  return NextResponse.json({ message: "Invoice deleted" });
}
