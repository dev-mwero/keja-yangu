import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { requirePermission } from "@/lib/permissions";
import { Invoice } from "@/models/Invoice";
import { Unit } from "@/models/Unit";
import { Property } from "@/models/Property";
import { currentPeriod } from "@/lib/invoicing";

export async function GET(request: NextRequest) {
  const propertyId = request.nextUrl.searchParams.get("propertyId");
  const ownerId = request.nextUrl.searchParams.get("ownerId");

  // Determine actor and authorization
  const authError = await requirePermission(request, "invoice:read");
  if (authError instanceof NextResponse) return authError;

  await connectToDatabase();

  const now = new Date();
  const period = currentPeriod(now);

  // ---- Expected amount: sum of all unit rents ----
  let expectedAmount = 0;
  let units = [];

  if (propertyId) {
    units = await Unit.find({ propertyId }).lean();
    expectedAmount = units.reduce((sum, unit) => sum + (unit.rent ?? 0), 0);
  } else if (ownerId) {
    // Get all properties owned by this owner, then their units
    const properties = await Property.find({ ownerId }).lean();
    for (const prop of properties) {
      const propUnits = await Unit.find({ propertyId: prop._id }).lean();
      expectedAmount += propUnits.reduce((sum, unit) => sum + (unit.rent ?? 0), 0);
    }
    units = [];
  }

  // ---- Actual and paid amounts from invoices for current period ----
  const invoiceFilter: Record<string, unknown> = { period };
  if (propertyId) invoiceFilter.propertyId = propertyId;
  if (ownerId) invoiceFilter.ownerId = ownerId;

  const [invoices, invoiceTotal] = await Promise.all([
    Invoice.find(invoiceFilter)
      .sort({ issuedAt: -1 })
      .lean(),
    Invoice.countDocuments(invoiceFilter),
  ]);

  const actualAmount = invoices.reduce((sum, inv) => sum + inv.amountDue, 0);
  const paidAmount = invoices.reduce((sum, inv) => sum + (inv.amountPaid ?? 0), 0);

  return NextResponse.json({
    expectedAmount,
    actualAmount,
    paidAmount,
    period,
    unitCount: units.length,
    invoiceCount: invoiceTotal,
  });
}