import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isDuplicateKeyError, readJsonBody, resolveInvoiceActor } from "@/app/api/v1/_helpers";
import { generateForPeriod, type UnitCharge } from "@/lib/invoice-generation";
import { nextInvoiceNumber } from "@/lib/invoice-numbering";
import { currentPeriod } from "@/lib/invoicing";
import { connectToDatabase } from "@/lib/mongoose";
import { DAY_IN_MS, notifyLeaseExpiry } from "@/lib/notifications";
import { requirePermission } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { invoiceGenerateInput } from "@/lib/schemas";
import { Invoice } from "@/models/Invoice";
import { Lease } from "@/models/Lease";
import { Tenant } from "@/models/Tenant";
import { Unit } from "@/models/Unit";

export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 20 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const authError = await requirePermission(request, "invoice:generate");
  if (authError) return authError;

  const body = await readJsonBody(request);
  const parsed = invoiceGenerateInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid generate payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectToDatabase();

  const actor = await resolveInvoiceActor(request);
  if (actor instanceof NextResponse) return actor;

  const now = new Date();
  const period = parsed.data.period ?? currentPeriod(now);
  if (period > currentPeriod(now)) {
    return NextResponse.json(
      { error: "Cannot generate invoices for future periods" },
      { status: 400 },
    );
  }

  const filter: Record<string, unknown> = { status: "active" };
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

  const leases = await Lease.find(filter).lean();
  const leaseIds = leases.map((lease) => String(lease._id));
  const existing = await Invoice.find({ leaseId: { $in: leaseIds }, period })
    .select("leaseId")
    .lean();

  // Resolve each lease's unit service-charge configuration so generated
  // invoices carry the rent / service-charge breakdown.
  const unitIds = [...new Set(leases.map((l) => l.unitId).filter(Boolean))] as string[];
  const units = unitIds.length > 0 ? await Unit.find({ _id: { $in: unitIds } }).lean() : [];
  const unitById = new Map<
    string,
    {
      serviceCharge: number;
      rentIncludesServiceCharge: boolean;
      rentSharePercent: number;
      serviceChargeSharePercent: number;
    }
  >();
  for (const unit of units) {
    unitById.set(String(unit._id), {
      serviceCharge: unit.serviceCharge ?? 0,
      rentIncludesServiceCharge: unit.rentIncludesServiceCharge ?? false,
      rentSharePercent: unit.rentSharePercent ?? 100,
      serviceChargeSharePercent: unit.serviceChargeSharePercent ?? 0,
    });
  }
  const unitChargeByLeaseId = new Map<string, UnitCharge>();
  for (const lease of leases) {
    const unit = lease.unitId ? unitById.get(String(lease.unitId)) : undefined;
    if (!unit) continue;
    unitChargeByLeaseId.set(String(lease._id), {
      serviceChargeAmount: unit.serviceCharge,
      rentIncludesServiceCharge: unit.rentIncludesServiceCharge,
      rentSharePercent: unit.rentSharePercent,
      serviceChargeSharePercent: unit.serviceChargeSharePercent,
    });
  }

  // Lazy lease-expiry seam: notify owners, their caretakers and the tenant
  // when a lease ends within the next 30 days. Dedupe keeps repeat generations
  // from re-firing within a lease's lifetime.
  const expiring = leases.filter(
    (lease) =>
      lease.endDate &&
      lease.endDate.getTime() >= now.getTime() &&
      lease.endDate.getTime() <= now.getTime() + 30 * DAY_IN_MS,
  );
  for (const lease of expiring) {
    const daysUntil = Math.max(0, Math.ceil((lease.endDate.getTime() - now.getTime()) / DAY_IN_MS));
    await notifyLeaseExpiry(lease, daysUntil);
  }

  // Short-circuit: every active lease already has an invoice for this period.
  // Skip number reservation and invoice creation entirely — idempotent no-op.
  const existingIds = new Set(existing.map((invoice) => invoice.leaseId));
  if (leaseIds.length > 0 && leaseIds.every((id) => existingIds.has(id))) {
    return NextResponse.json({
      data: { created: 0, skipped: leaseIds.length },
      message: `Generated 0 invoice(s) for ${period}, ${leaseIds.length} skipped`,
    });
  }

  const tenantIds = [...new Set(leases.map((lease) => String(lease.tenantId)))];
  const tenants =
    tenantIds.length > 0
      ? await Tenant.find({ _id: { $in: tenantIds } })
          .select("_id type")
          .lean()
      : [];
  const tenantTypeById = new Map<string, "residential" | "commercial" | "owning">();
  for (const tenant of tenants as Array<{
    _id: unknown;
    type?: "residential" | "commercial" | "owning";
  }>) {
    tenantTypeById.set(String(tenant._id), tenant.type ?? "residential");
  }
  const leasesWithTenantType = leases.map((lease) => ({
    ...lease,
    tenantType: tenantTypeById.get(String(lease.tenantId)) ?? "residential",
  }));

  const { toCreate, skipped } = generateForPeriod({
    leases: leasesWithTenantType,
    existing,
    period,
    now,
    unitChargeByLeaseId,
  });

  let created = 0;
  let skippedCount = skipped.length;
  for (const draft of toCreate) {
    draft.invoiceNumber = await nextInvoiceNumber(draft.ownerId, period);
    try {
      await Invoice.create(draft);
      created += 1;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      skippedCount += 1;
    }
  }

  console.info(
    `[invoicing] generate actor=${actor.userId} role=${actor.role} period=${period} created=${created} skipped=${skippedCount}`,
  );

  return NextResponse.json({
    data: { created, skipped: skippedCount },
    message: `Generated ${created} invoice(s) for ${period}, ${skippedCount} skipped`,
  });
}
