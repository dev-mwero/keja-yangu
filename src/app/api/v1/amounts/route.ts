import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveInvoiceActor } from "@/app/api/v1/_helpers";
import {
  type ContractedRentSource,
  type RentSourceProperty,
  type RentSourceUnit,
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

/** Assignment-backed coverage of a staff member, resolved from the session. */
interface StaffScope {
  propertyIds: string[];
  unitIds: string[];
  tenantIds: string[];
}

interface AmountsInvoiceRow {
  amountDue: number;
  amountPaid?: number | null;
}

interface PeriodHistoryRow {
  _id: string;
  billed: number;
  collected: number;
  open: number;
  count: number;
}

/** Fold ANDed clauses into a single filter; a lone clause stays unwrapped. */
function allOf(clauses: Record<string, unknown>[]): Record<string, unknown> {
  if (clauses.length === 0) return {};
  if (clauses.length === 1) return clauses[0];
  return { $and: clauses };
}

/** Fold ORed clauses; `null` means the scope matches nothing at all. */
function anyOf(clauses: Record<string, unknown>[]): Record<string, unknown> | null {
  if (clauses.length === 0) return null;
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}

/**
 * `$or` clauses for collections carrying `propertyId`, `unitId` and `tenantId`
 * (invoices and leases). Empty arrays are omitted so a clause can never match
 * every document.
 */
function documentScopeClauses(scope: StaffScope): Record<string, unknown>[] {
  const clauses: Record<string, unknown>[] = [];
  if (scope.propertyIds.length > 0) {
    clauses.push({ propertyId: { $in: scope.propertyIds } });
  }
  if (scope.unitIds.length > 0) {
    clauses.push({ unitId: { $in: scope.unitIds } });
  }
  if (scope.tenantIds.length > 0) {
    clauses.push({ tenantId: { $in: scope.tenantIds } });
  }
  return clauses;
}

/**
 * Units have no `unitId`/`tenantId` of their own: property-level coverage
 * matches on `propertyId`, while block- and unit-level coverage resolves to
 * unit ids and matches on `_id`.
 */
function unitScopeClauses(scope: StaffScope): Record<string, unknown>[] {
  const clauses: Record<string, unknown>[] = [];
  if (scope.propertyIds.length > 0) {
    clauses.push({ propertyId: { $in: scope.propertyIds } });
  }
  if (scope.unitIds.length > 0) {
    clauses.push({ _id: { $in: scope.unitIds } });
  }
  return clauses;
}

function buildAmountsResponse({
  period,
  properties = [],
  units = [],
  invoices = [],
  invoiceCount = 0,
  leases = [],
  periodHistory = [],
}: {
  period: string;
  properties?: RentSourceProperty[];
  units?: RentSourceUnit[];
  invoices?: AmountsInvoiceRow[];
  invoiceCount?: number;
  leases?: ContractedRentSource[];
  periodHistory?: PeriodHistoryRow[];
}) {
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

  return {
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
  };
}

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
 * never trusted from the query string: admins, caretakers and custodians read
 * only the properties, units and tenants their active assignments cover —
 * property-level assignments include every unit and lease of that property,
 * block/unit-level ones only the units they resolve to. Staff whose assignments
 * resolve to no scope fail closed to a zeroed payload. `ownerId` is honoured
 * for system-admins only.
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

  const actor = await resolveInvoiceActor(request, "invoice:read");
  if (actor instanceof NextResponse) return actor;

  // ---- Resolve the caller's scope -----------------------------------------
  let ownerScope = "";
  let assignedPropertyIds: string[] | null = null;
  let staffScope: StaffScope | null = null;

  switch (actor.role) {
    case "admin":
    case "caretaker":
    case "custodian":
      staffScope = {
        propertyIds: actor.propertyScopeIds,
        unitIds: actor.assignedUnitIds,
        tenantIds: actor.assignedTenantIds,
      };
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

  const documentScope = staffScope ? anyOf(documentScopeClauses(staffScope)) : null;
  // Fail closed: a staff member whose assignments resolve to no property, unit
  // or tenant clause must never reach the queries with a blank filter — that
  // would report the whole platform's financials.
  if (staffScope && !documentScope) {
    return NextResponse.json(buildAmountsResponse({ period }));
  }
  const unitScope = staffScope ? anyOf(unitScopeClauses(staffScope)) : null;

  // ---- Filters are ANDed: a foreign `propertyId` simply matches nothing ----
  const propertyFilter = allOf([
    ...(requestedPropertyId
      ? [{ _id: requestedPropertyId }]
      : assignedPropertyIds
        ? [{ _id: { $in: assignedPropertyIds } }]
        : []),
    ...(ownerScope ? [{ ownerId: ownerScope }] : []),
  ]);

  const unitClauses: Record<string, unknown>[] = [];
  if (requestedPropertyId) unitClauses.push({ propertyId: requestedPropertyId });
  if (unitScope) unitClauses.push(unitScope);
  else if (!requestedPropertyId) {
    if (assignedPropertyIds) unitClauses.push({ propertyId: { $in: assignedPropertyIds } });
    else if (ownerScope) unitClauses.push({ ownerId: ownerScope });
  }
  const unitFilter = allOf(unitClauses);

  const invoiceStatusFilter = { $nin: ["draft", "void"] };
  const invoiceScopeClauses: Record<string, unknown>[] = [];
  if (requestedPropertyId) invoiceScopeClauses.push({ propertyId: requestedPropertyId });
  if (documentScope) invoiceScopeClauses.push(documentScope);
  else if (!requestedPropertyId && assignedPropertyIds) {
    invoiceScopeClauses.push({ propertyId: { $in: assignedPropertyIds } });
  }
  if (ownerScope) invoiceScopeClauses.push({ ownerId: ownerScope });
  const invoiceScopeFilter = allOf(invoiceScopeClauses);

  const invoiceFilter = { ...invoiceScopeFilter, period, status: invoiceStatusFilter };

  const { start: periodStart, end: periodEnd } = periodRange(period);
  const leaseClauses: Record<string, unknown>[] = [];
  if (requestedPropertyId) leaseClauses.push({ propertyId: requestedPropertyId });
  if (documentScope) leaseClauses.push(documentScope);
  else if (!requestedPropertyId && assignedPropertyIds) {
    leaseClauses.push({ propertyId: { $in: assignedPropertyIds } });
  }
  if (ownerScope) leaseClauses.push({ ownerId: ownerScope });
  const leaseFilter = allOf([
    {
      startDate: { $lte: periodEnd },
      $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: periodStart } }],
    },
    ...leaseClauses,
  ]);

  const [properties, units, invoices, invoiceCount, leases, periodHistory] = await Promise.all([
    Property.find(propertyFilter).select("blocks ownerId price").lean(),
    Unit.find(unitFilter).lean(),
    Invoice.find(invoiceFilter).lean(),
    Invoice.countDocuments(invoiceFilter),
    Lease.find(leaseFilter).select("rentAmount startDate endDate").lean(),
    Invoice.aggregate<PeriodHistoryRow>([
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

  return NextResponse.json(
    buildAmountsResponse({
      period,
      properties,
      units,
      invoices,
      invoiceCount,
      leases,
      periodHistory,
    }),
  );
}
