import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  isDuplicateKeyError,
  isInvoiceNumberCollision,
  readJsonBody,
  resolveInvoiceActor,
} from "@/app/api/v1/_helpers";
import {
  billingFieldsFromAccount,
  resolveBillingAccountForLease,
  resolveBillingAccountForOwner,
} from "@/lib/billing-accounts";
import { buildInvoiceForLease } from "@/lib/invoice-generation";
import { nextInvoiceNumber } from "@/lib/invoice-numbering";
import { computeDueDate, currentPeriod, serializeInvoice } from "@/lib/invoicing";
import { connectToDatabase } from "@/lib/mongoose";
import { notifyOverdueInvoices } from "@/lib/notifications";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { requirePermission } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { invoiceInput } from "@/lib/schemas";
import { loadServiceFeeForUnit, type UnitServiceFee } from "@/lib/service-fees";
import { Invoice } from "@/models/Invoice";
import { Lease } from "@/models/Lease";
import { Tenant } from "@/models/Tenant";

export async function GET(request: NextRequest) {
  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const skip = (page - 1) * limit;
  const searchParams = request.nextUrl.searchParams;
  const period = searchParams.get("period");
  const status = searchParams.get("status");
  const tenantId = searchParams.get("tenantId");
  const propertyId = searchParams.get("propertyId");
  const leaseId = searchParams.get("leaseId");
  const now = new Date();

  const authError = await requirePermission(request, "invoice:read");
  if (authError) return authError;

  await connectToDatabase();

  const actor = await resolveInvoiceActor(request, "invoice:read");
  if (actor instanceof NextResponse) return actor;

  if (actor.role === "caretaker" && propertyId && !actor.assignedPropertyIds.includes(propertyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const filter: Record<string, unknown> = {};
  if (actor.role === "custodian" && actor.staffAssignmentBacked) {
    const scopes: Record<string, unknown>[] = [];
    if (actor.propertyScopeIds.length > 0) {
      scopes.push({ propertyId: { $in: actor.propertyScopeIds } });
    }
    if (actor.assignedUnitIds.length > 0) {
      scopes.push({ unitId: { $in: actor.assignedUnitIds } });
    }
    if (actor.assignedTenantIds.length > 0) {
      scopes.push({ tenantId: { $in: actor.assignedTenantIds } });
    }
    if (scopes.length === 0) {
      return NextResponse.json(buildPaginationResult([], 0, page, limit));
    }
    filter.$or = scopes;
  } else if (actor.role === "custodian") {
    if (!actor.managedByOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    filter.ownerId = actor.managedByOwnerId;
  }
  if (actor.role === "caretaker") {
    const scopes: Record<string, unknown>[] = [];
    if (actor.propertyScopeIds.length > 0) {
      scopes.push({ propertyId: { $in: actor.propertyScopeIds } });
    }
    if (actor.assignedUnitIds.length > 0) {
      scopes.push({ unitId: { $in: actor.assignedUnitIds } });
    }
    if (actor.assignedTenantIds.length > 0) {
      scopes.push({ tenantId: { $in: actor.assignedTenantIds } });
    }
    if (scopes.length === 0) {
      return NextResponse.json(buildPaginationResult([], 0, page, limit));
    }
    filter.$or = scopes;
  }
  if (actor.role === "admin") {
    const scopes: Record<string, unknown>[] = [];
    if (actor.propertyScopeIds.length > 0) {
      scopes.push({ propertyId: { $in: actor.propertyScopeIds } });
    }
    if (actor.assignedUnitIds.length > 0) {
      scopes.push({ unitId: { $in: actor.assignedUnitIds } });
    }
    if (actor.assignedTenantIds.length > 0) {
      scopes.push({ tenantId: { $in: actor.assignedTenantIds } });
    }
    if (scopes.length === 0) {
      return NextResponse.json(buildPaginationResult([], 0, page, limit));
    }
    filter.$or = scopes;
  }
  if (period) filter.period = period;
  if (tenantId) filter.tenantId = tenantId;
  if (propertyId) filter.propertyId = propertyId;
  if (leaseId) filter.leaseId = leaseId;
  if (status === "overdue") {
    filter.status = "pending";
    filter.dueDate = { $lt: now };
  } else if (status) {
    filter.status = status;
  }

  if (status === "overdue") {
    // Lazy catch-up sweep: scope follows the actor (not the query filters, so
    // an owner's `tenantId=` read can't sweep outside their portfolio).
    let sweepScope: Record<string, unknown> = {};
    if (actor.role === "caretaker") {
      sweepScope = actor.staffAssignmentBacked
        ? { propertyId: { $in: actor.assignedPropertyIds } }
        : {
            propertyId: { $in: actor.assignedPropertyIds },
            ownerId: actor.managedByOwnerId,
          };
    } else if (actor.role === "custodian") {
      sweepScope = actor.staffAssignmentBacked
        ? { propertyId: { $in: actor.propertyScopeIds } }
        : { ownerId: actor.managedByOwnerId };
    }
    await notifyOverdueInvoices(now, sweepScope);
  }

  const [invoices, total] = await Promise.all([
    Invoice.find(filter).sort({ issuedAt: -1 }).skip(skip).limit(limit).lean(),
    Invoice.countDocuments(filter),
  ]);

  return NextResponse.json(
    buildPaginationResult(
      invoices.map((doc) => serializeInvoice(doc, now, { includeServiceFeeItems: true })),
      total,
      page,
      limit,
    ),
  );
}

export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 20 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const authError = await requirePermission(request, "invoice:manage");
  if (authError) return authError;

  const body = await readJsonBody(request);
  const parsed = invoiceInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid invoice payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectToDatabase();

  const actor = await resolveInvoiceActor(request, "invoice:manage");
  if (actor instanceof NextResponse) return actor;

  const period = currentPeriod();
  const now = new Date();
  const status = parsed.data.status ?? "pending";

  let derived: {
    tenantId: string;
    propertyId: string;
    leaseId: string;
    unitId?: string;
    billingAccountId?: string;
    billingAdminId?: string;
    billingSnapshot?: { legalEntityName?: string; invoicePrefix?: string };
    ownerId: string;
    amountDue: number;
    rentAmount: number;
    serviceChargeAmount: number;
    rentIncludesServiceCharge: boolean;
    serviceFeeItems: Array<{ itemId: string; label: string; amount: number }>;
  };

  if (parsed.data.leaseId) {
    const lease = await Lease.findById(parsed.data.leaseId).lean();
    if (!lease) {
      return NextResponse.json({ error: "Lease not found" }, { status: 404 });
    }
    if (actor.role === "custodian") {
      if (actor.staffAssignmentBacked) {
        const coversProperty = actor.propertyScopeIds.includes(lease.propertyId);
        const coversUnit = lease.unitId && actor.assignedUnitIds.includes(String(lease.unitId));
        if (!coversProperty && !coversUnit) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      } else if (lease.ownerId !== actor.managedByOwnerId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    if (actor.role === "caretaker") {
      const coversProperty = actor.propertyScopeIds.includes(lease.propertyId);
      const coversUnit = lease.unitId && actor.assignedUnitIds.includes(String(lease.unitId));
      if (!coversProperty && !coversUnit) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    if (actor.role === "admin") {
      const coversProperty = actor.propertyScopeIds.includes(lease.propertyId);
      const coversUnit = lease.unitId && actor.assignedUnitIds.includes(String(lease.unitId));
      if (!coversProperty && !coversUnit) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    const fee: UnitServiceFee | null = lease.unitId
      ? await loadServiceFeeForUnit(String(lease.unitId))
      : null;
    const draft = buildInvoiceForLease(lease, period, now, fee);
    const billingFields = billingFieldsFromAccount(
      await resolveBillingAccountForLease({
        billingAccountId: lease.billingAccountId,
        unitId: lease.unitId ? String(lease.unitId) : undefined,
        ownerId: lease.ownerId,
      }),
    );
    derived = {
      tenantId: lease.tenantId,
      propertyId: lease.propertyId,
      leaseId: parsed.data.leaseId,
      unitId: lease.unitId ? String(lease.unitId) : "",
      billingAccountId: billingFields?.billingAccountId ?? lease.billingAccountId ?? "",
      billingAdminId: billingFields?.billingAdminId ?? "",
      billingSnapshot: billingFields?.billingSnapshot,
      ownerId: lease.ownerId,
      amountDue: draft.amountDue,
      rentAmount: draft.rentAmount,
      serviceChargeAmount: draft.serviceChargeAmount,
      rentIncludesServiceCharge: draft.rentIncludesServiceCharge,
      serviceFeeItems: draft.serviceFeeItems,
    };
  } else {
    const tenantId = parsed.data.tenantId;
    const propertyId = parsed.data.propertyId;
    if (tenantId == null || propertyId == null) {
      return NextResponse.json(
        { error: "tenantId and propertyId are required for manual invoices" },
        { status: 400 },
      );
    }
    const tenant = await Tenant.findById(tenantId).lean();
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }
    if (actor.role === "custodian") {
      if (actor.staffAssignmentBacked) {
        const coversProperty = actor.propertyScopeIds.includes(propertyId);
        const coversTenant = actor.assignedTenantIds.includes(tenantId);
        if (!coversProperty && !coversTenant) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      } else if (tenant.ownerId !== actor.managedByOwnerId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    if (actor.role === "caretaker") {
      const coversProperty = actor.propertyScopeIds.includes(propertyId);
      const coversTenant = actor.assignedTenantIds.includes(tenantId);
      if (!coversProperty && !coversTenant) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    if (actor.role === "admin") {
      const coversProperty = actor.propertyScopeIds.includes(propertyId);
      const coversTenant = actor.assignedTenantIds.includes(tenantId);
      if (!coversProperty && !coversTenant) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    const amountDue = parsed.data.amountDue;
    if (amountDue == null) {
      return NextResponse.json(
        { error: "amountDue is required when creating a manual invoice without a lease" },
        { status: 400 },
      );
    }
    derived = {
      tenantId,
      propertyId,
      leaseId: "",
      ownerId: tenant.ownerId,
      billingAccountId: "",
      billingAdminId: "",
      amountDue,
      rentAmount: amountDue,
      serviceChargeAmount: 0,
      rentIncludesServiceCharge: false,
      serviceFeeItems: [],
    };
    const billingFields = billingFieldsFromAccount(
      await resolveBillingAccountForOwner(tenant.ownerId),
    );
    if (billingFields) Object.assign(derived, billingFields);
  }

  let invoiceNumber = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    invoiceNumber = await nextInvoiceNumber(derived.ownerId, period, {
      billingAccountId: derived.billingAccountId,
    });
    try {
      const invoice = await Invoice.create({
        invoiceNumber,
        tenantId: derived.tenantId,
        propertyId: derived.propertyId,
        leaseId: derived.leaseId,
        unitId: derived.unitId ?? "",
        ownerId: derived.ownerId,
        billingAccountId: derived.billingAccountId ?? "",
        billingAdminId: derived.billingAdminId ?? "",
        billingSnapshot: derived.billingSnapshot,
        period,
        amountDue: derived.amountDue,
        amountPaid: 0,
        status,
        dueDate: computeDueDate(period),
        method: parsed.data.method,
        notes: parsed.data.notes,
        rentAmount: derived.rentAmount,
        serviceChargeAmount: derived.serviceChargeAmount,
        rentIncludesServiceCharge: derived.rentIncludesServiceCharge,
        serviceFeeItems: derived.serviceFeeItems,
      });
      const created = await Invoice.findById(invoice._id).lean();
      if (!created) {
        return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
      }
      return NextResponse.json(
        { data: serializeInvoice(created, now, { includeServiceFeeItems: true }) },
        { status: 201 },
      );
    } catch (error) {
      if (isInvoiceNumberCollision(error)) continue;
      if (isDuplicateKeyError(error)) {
        return NextResponse.json(
          { error: "Invoice already exists for this lease and period" },
          { status: 409 },
        );
      }
      throw error;
    }
  }

  return NextResponse.json({ error: "Could not reserve a unique invoice number" }, { status: 409 });
}
