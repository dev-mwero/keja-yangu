import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveInvoiceActor } from "@/app/api/v1/_helpers";
import { sumExpectedRent } from "@/lib/amounts";
import { currentPeriod, PERIOD_REGEX } from "@/lib/invoicing";
import { connectToDatabase } from "@/lib/mongoose";
import { requirePermission } from "@/lib/permissions";
import { Invoice } from "@/models/Invoice";
import { Property } from "@/models/Property";
import { Unit } from "@/models/Unit";

/**
 * `GET /api/v1/amounts?propertyId=&ownerId=&period=`
 *
 * Returns `{ expectedAmount, actualAmount, paidAmount, period, unitCount,
 * invoiceCount }`. Expected rent is the unit → floor → block rollup, actual is
 * the sum of `amountDue` for the period and paid the sum of `amountPaid`.
 *
 * Scope is derived from the session (same convention as `invoices/route.ts`),
 * never trusted from the query string: an owner always reads their own
 * portfolio, a custodian their managing owner's, a caretaker only the
 * properties assigned to them. `ownerId` is honoured for system-admins only.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const requestedPropertyId = searchParams.get("propertyId");
  const requestedOwnerId = searchParams.get("ownerId");
  const requestedPeriod = searchParams.get("period");
  const period =
    requestedPeriod && PERIOD_REGEX.test(requestedPeriod) ? requestedPeriod : currentPeriod();

  const authError = await requirePermission(request, "invoice:read");
  if (authError instanceof NextResponse) return authError;

  await connectToDatabase();

  const actor = await resolveInvoiceActor(request);
  if (actor instanceof NextResponse) return actor;

  // ---- Resolve the caller's scope -----------------------------------------
  let ownerScope = "";
  let assignedPropertyIds: string[] | null = null;

  switch (actor.role) {
    case "owner":
      ownerScope = actor.userId;
      break;
    case "custodian":
      if (!actor.managedByOwnerId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      ownerScope = actor.managedByOwnerId;
      break;
    case "caretaker":
      if (!actor.managedByOwnerId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      ownerScope = actor.managedByOwnerId;
      assignedPropertyIds = actor.assignedPropertyIds;
      break;
    case "system-admin":
      ownerScope = requestedOwnerId ?? "";
      break;
    default:
      // Tenants hold `invoice:read-own`, not `invoice:read`; anything else
      // reaching here has no business on a portfolio-wide amount rollup.
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (
    requestedPropertyId &&
    assignedPropertyIds &&
    !assignedPropertyIds.includes(requestedPropertyId)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ---- Filters are ANDed: a foreign `propertyId` simply matches nothing ----
  const propertyFilter: Record<string, unknown> = {};
  if (requestedPropertyId) propertyFilter._id = requestedPropertyId;
  else if (assignedPropertyIds) propertyFilter._id = { $in: assignedPropertyIds };
  if (ownerScope) propertyFilter.ownerId = ownerScope;

  let unitFilter: Record<string, unknown>;
  if (requestedPropertyId) unitFilter = { propertyId: requestedPropertyId };
  else if (assignedPropertyIds) unitFilter = { propertyId: { $in: assignedPropertyIds } };
  else if (ownerScope) unitFilter = { ownerId: ownerScope };
  else unitFilter = {};

  const invoiceFilter: Record<string, unknown> = { period };
  if (requestedPropertyId) invoiceFilter.propertyId = requestedPropertyId;
  if (ownerScope) invoiceFilter.ownerId = ownerScope;
  if (assignedPropertyIds) invoiceFilter.propertyId = { $in: assignedPropertyIds };

  const [properties, units, invoices, invoiceCount] = await Promise.all([
    Property.find(propertyFilter).select("blocks ownerId").lean(),
    Unit.find(unitFilter).lean(),
    Invoice.find(invoiceFilter).lean(),
    Invoice.countDocuments(invoiceFilter),
  ]);

  const expectedAmount = sumExpectedRent(units, properties);
  const actualAmount = invoices.reduce((sum, inv) => sum + inv.amountDue, 0);
  const paidAmount = invoices.reduce((sum, inv) => sum + (inv.amountPaid ?? 0), 0);

  return NextResponse.json({
    expectedAmount,
    actualAmount,
    paidAmount,
    period,
    unitCount: units.length,
    invoiceCount,
  });
}
