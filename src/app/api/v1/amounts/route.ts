import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveInvoiceActor } from "@/app/api/v1/_helpers";
import {
  sumContractedRentForPeriod,
  sumOccupiedMonthlyRent,
  sumPotentialMonthlyRent,
} from "@/lib/amounts";
import { currentPeriod, PERIOD_REGEX, periodRange } from "@/lib/invoicing";
import { connectToDatabase } from "@/lib/mongoose";
import { requirePermission } from "@/lib/permissions";
import { Invoice } from "@/models/Invoice";
import { Lease } from "@/models/Lease";
import { Property } from "@/models/Property";
import { Unit } from "@/models/Unit";

/**
 * `GET /api/v1/amounts?propertyId=&ownerId=&period=`
 *
 * The single source of truth for staff money figures. Returns the current rent
 * roll (potential/occupied/contracted rent) plus collection totals for an
 * invoice period, and a per-period history so callers never have to sum a
 * paginated invoice list by hand.
 *
 * Potential/occupied rent use unit → floor → block → property rent. Billed,
 * collected and outstanding are scoped to the selected rent period and exclude
 * drafts and void invoices — `collected + outstanding === billed` for every
 * period, so every screen that reads this route reports the same numbers.
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
  if (ownerScope) unitFilter.ownerId = ownerScope;

  const invoiceStatusFilter = { $nin: ["draft", "void"] };
  const invoiceScopeFilter: Record<string, unknown> = {};
  if (requestedPropertyId) invoiceScopeFilter.propertyId = requestedPropertyId;
  else if (assignedPropertyIds) invoiceScopeFilter.propertyId = { $in: assignedPropertyIds };
  if (ownerScope) invoiceScopeFilter.ownerId = ownerScope;

  const invoiceFilter = { ...invoiceScopeFilter, period, status: invoiceStatusFilter };

  const { start: periodStart, end: periodEnd } = periodRange(period);
  const leaseFilter: Record<string, unknown> = {
    startDate: { $lte: periodEnd },
    $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: periodStart } }],
  };
  if (requestedPropertyId) leaseFilter.propertyId = requestedPropertyId;
  else if (assignedPropertyIds) leaseFilter.propertyId = { $in: assignedPropertyIds };
  if (ownerScope) leaseFilter.ownerId = ownerScope;

  const [properties, units, invoices, invoiceCount, leases, periodHistory] = await Promise.all([
    Property.find(propertyFilter).select("blocks ownerId price").lean(),
    Unit.find(unitFilter).lean(),
    Invoice.find(invoiceFilter).lean(),
    Invoice.countDocuments(invoiceFilter),
    Lease.find(leaseFilter).select("rentAmount startDate endDate").lean(),
    Invoice.aggregate<{
      _id: string;
      billed: number;
      collected: number;
      open: number;
      count: number;
    }>([
      { $match: { ...invoiceScopeFilter, status: invoiceStatusFilter } },
      {
        $group: {
          _id: "$period",
          billed: { $sum: "$amountDue" },
          collected: {
            $sum: {
              $cond: [
                { $lt: [{ $ifNull: ["$amountPaid", 0] }, "$amountDue"] },
                { $ifNull: ["$amountPaid", 0] },
                "$amountDue",
              ],
            },
          },
          open: {
            $sum: {
              $cond: [
                { $gt: [{ $subtract: ["$amountDue", { $ifNull: ["$amountPaid", 0] }] }, 0] },
                1,
                0,
              ],
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 12 },
    ]),
  ]);

  const potentialMonthlyRent = sumPotentialMonthlyRent(units, properties);
  const occupiedMonthlyRent = sumOccupiedMonthlyRent(units, properties);
  const contractedRent = sumContractedRentForPeriod(leases, period);
  const rentBilled = invoices.reduce((sum, inv) => sum + inv.amountDue, 0);
  const rentCollected = invoices.reduce(
    (sum, inv) => sum + Math.min(inv.amountDue, inv.amountPaid ?? 0),
    0,
  );
  const rentOutstanding = invoices.reduce(
    (sum, inv) => sum + Math.max(0, inv.amountDue - (inv.amountPaid ?? 0)),
    0,
  );
  const openInvoiceCount = invoices.filter(
    (inv) => Math.max(0, inv.amountDue - (inv.amountPaid ?? 0)) > 0,
  ).length;

  return NextResponse.json({
    potentialMonthlyRent,
    occupiedMonthlyRent,
    contractedRent,
    rentBilled,
    rentCollected,
    rentOutstanding,
    openInvoiceCount,
    period,
    byPeriod: periodHistory.map((row) => ({
      period: row._id,
      billed: row.billed,
      collected: row.collected,
      open: row.open,
      count: row.count,
    })),
    unitCount: units.filter((unit) => unit.status === "available" || unit.status === "occupied")
      .length,
    invoiceCount,
    occupiedUnitCount: units.filter((unit) => unit.status === "occupied").length,
  });
}
