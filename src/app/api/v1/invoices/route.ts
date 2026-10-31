import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isDuplicateKeyError, readJsonBody, resolveInvoiceActor } from "@/app/api/v1/_helpers";
import { buildInvoiceForLease } from "@/lib/invoice-generation";
import { nextInvoiceNumber } from "@/lib/invoice-numbering";
import { computeDueDate, currentPeriod, serializeInvoice } from "@/lib/invoicing";
import { connectToDatabase } from "@/lib/mongoose";
import { notifyOverdueInvoices } from "@/lib/notifications";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { requirePermission } from "@/lib/permissions";
import { loadServiceFeeForUnit, type UnitServiceFee } from "@/lib/service-fees";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { invoiceInput } from "@/lib/schemas";
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

  const actor = await resolveInvoiceActor(request);
  if (actor instanceof NextResponse) return actor;

  if (actor.role === "caretaker" && propertyId && !actor.assignedPropertyIds.includes(propertyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const filter: Record<string, unknown> = {};
  if (actor.role === "owner") filter.ownerId = actor.userId;
  if (actor.role === "custodian") {
    if (!actor.managedByOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    filter.ownerId = actor.managedByOwnerId;
  }
  if (actor.role === "caretaker") {
    filter.propertyId = { $in: actor.assignedPropertyIds };
    filter.ownerId = actor.managedByOwnerId;
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
      sweepScope = {
        propertyId: { $in: actor.assignedPropertyIds },
        ownerId: actor.managedByOwnerId,
      };
    } else if (actor.role === "owner") {
      sweepScope = { ownerId: actor.userId };
    } else if (actor.role === "custodian") {
      sweepScope = { ownerId: actor.managedByOwnerId };
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

  const actor = await resolveInvoiceActor(request);
  if (actor instanceof NextResponse) return actor;

  const period = currentPeriod();
  const now = new Date();
  const status = parsed.data.status ?? "pending";

  let derived: {
    tenantId: string;
    propertyId: string;
    leaseId: string;
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
    if (actor.role === "owner" && lease.ownerId !== actor.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (actor.role === "custodian" && lease.ownerId !== actor.managedByOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (
      actor.role === "caretaker" &&
      (lease.ownerId !== actor.managedByOwnerId ||
        !actor.assignedPropertyIds.includes(lease.propertyId))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const fee: UnitServiceFee | null = lease.unitId
      ? await loadServiceFeeForUnit(String(lease.unitId))
      : null;
    const draft = buildInvoiceForLease(lease, period, now, fee);
    derived = {
      tenantId: lease.tenantId,
      propertyId: lease.propertyId,
      leaseId: parsed.data.leaseId,
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
    if (actor.role === "owner" && tenant.ownerId !== actor.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (actor.role === "custodian" && tenant.ownerId !== actor.managedByOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (
      actor.role === "caretaker" &&
      (tenant.ownerId !== actor.managedByOwnerId || !actor.assignedPropertyIds.includes(propertyId))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
      amountDue,
      rentAmount: amountDue,
      serviceChargeAmount: 0,
      rentIncludesServiceCharge: false,
      serviceFeeItems: [],
    };
  }

  const invoiceNumber = await nextInvoiceNumber(derived.ownerId, period);

  try {
    const invoice = await Invoice.create({
      invoiceNumber,
      tenantId: derived.tenantId,
      propertyId: derived.propertyId,
      leaseId: derived.leaseId,
      ownerId: derived.ownerId,
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
    if (isDuplicateKeyError(error)) {
      return NextResponse.json(
        { error: "Invoice already exists for this lease and period" },
        { status: 409 },
      );
    }
    throw error;
  }
}
