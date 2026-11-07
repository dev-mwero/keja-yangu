import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readJsonBody, resolveInvoiceActor } from "@/app/api/v1/_helpers";
import { billingFieldsFromAccount, loadBillingAccountLookup } from "@/lib/billing-accounts";
import { generateForPeriod, type InvoiceDraft } from "@/lib/invoice-generation";
import { reserveInvoiceNumbers } from "@/lib/invoice-numbering";
import { currentPeriod } from "@/lib/invoicing";
import { connectToDatabase } from "@/lib/mongoose";
import { DAY_IN_MS, notifyLeaseExpiry } from "@/lib/notifications";
import { requirePermission } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { invoiceGenerateInput } from "@/lib/schemas";
import { loadServiceFeesForUnits, type UnitServiceFee } from "@/lib/service-fees";
import { Invoice } from "@/models/Invoice";
import { Lease } from "@/models/Lease";
import { Tenant } from "@/models/Tenant";

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

  const actor = await resolveInvoiceActor(request, "invoice:generate");
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
  if (actor.role === "admin") {
    const scopes: Record<string, unknown>[] = [];
    if (actor.propertyScopeIds.length > 0) {
      scopes.push({ propertyId: { $in: actor.propertyScopeIds } });
    }
    if (actor.assignedUnitIds.length > 0) {
      scopes.push({ unitId: { $in: actor.assignedUnitIds } });
    }
    if (scopes.length === 0) {
      return NextResponse.json({ data: { generatedCount: 0, invoices: [] } }, { status: 201 });
    }
    filter.$or = scopes;
  }

  const leases = await Lease.find(filter).lean();
  const leaseIds = leases.map((lease) => String(lease._id));
  const existing = await Invoice.find({ leaseId: { $in: leaseIds }, period })
    .select("leaseId")
    .lean();

  // Batch-resolve each lease's itemized service fee so generated invoices
  // carry the rent / service-fee snapshot without an N+1 query per lease.
  const unitIds = [...new Set(leases.map((l) => l.unitId).filter(Boolean))] as string[];
  const serviceFeeByUnitId = await loadServiceFeesForUnits(unitIds);
  const unitChargeByLeaseId = new Map<string, UnitServiceFee>();
  for (const lease of leases) {
    const fee = lease.unitId ? serviceFeeByUnitId.get(String(lease.unitId)) : undefined;
    if (fee) unitChargeByLeaseId.set(String(lease._id), fee);
  }

  // Lazy lease-expiry seam: notify owners, their caretakers and the tenant
  // when a lease ends within the next 30 days. Dedupe keeps repeat generations
  // from re-firing within a lease's lifetime. Notifications fan out per lease,
  // so run them with bounded concurrency instead of serial awaits.
  const expiring = leases.filter(
    (lease) =>
      lease.endDate &&
      lease.endDate.getTime() >= now.getTime() &&
      lease.endDate.getTime() <= now.getTime() + 30 * DAY_IN_MS,
  );
  const NOTIFY_CONCURRENCY = 10;
  for (let i = 0; i < expiring.length; i += NOTIFY_CONCURRENCY) {
    await Promise.all(
      expiring.slice(i, i + NOTIFY_CONCURRENCY).map(async (lease) => {
        const daysUntil = Math.max(
          0,
          Math.ceil((lease.endDate.getTime() - now.getTime()) / DAY_IN_MS),
        );
        await notifyLeaseExpiry(lease, daysUntil);
      }),
    );
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

  const billingLookup = await loadBillingAccountLookup({
    unitIds,
    billingAccountIds: leases.map((lease) => lease.billingAccountId),
    ownerIds: leases.map((lease) => lease.ownerId),
  });

  // Apply each draft's billing-account snapshot fields.
  for (const draft of toCreate) {
    const account =
      (draft.billingAccountId
        ? billingLookup.byAccountId.get(draft.billingAccountId)
        : undefined) ??
      billingLookup.byUnitId.get(draft.unitId ?? "") ??
      billingLookup.byOwnerId.get(draft.ownerId);
    const billingFields = billingFieldsFromAccount(account);
    if (billingFields) Object.assign(draft, billingFields);
  }

  // Bulk number reservation: group drafts by invoice-counter scope (billing
  // account when it exists, owner otherwise) and reserve one contiguous
  // block per group with a single atomic $inc. The unique invoiceNumber
  // index remains the backstop for a lost counter race.
  const groups = new Map<
    string,
    { ownerId: string; billingAccountId?: string; drafts: InvoiceDraft[] }
  >();
  for (const draft of toCreate) {
    const billingAccountId = draft.billingAccountId || undefined;
    const accountExists = billingAccountId
      ? billingLookup.byAccountId.has(billingAccountId)
      : false;
    const key = accountExists ? `acc:${billingAccountId}` : `owner:${draft.ownerId}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        ownerId: draft.ownerId,
        billingAccountId: accountExists ? billingAccountId : undefined,
        drafts: [],
      };
      groups.set(key, group);
    }
    group.drafts.push(draft);
  }
  for (const group of groups.values()) {
    const numbers = await reserveInvoiceNumbers(group.ownerId, period, group.drafts.length, {
      billingAccountId: group.billingAccountId,
    });
    group.drafts.forEach((draft, index) => {
      draft.invoiceNumber = numbers[index];
    });
  }

  // Bulk insert in chunks. Duplicate-key failures mean a concurrent run
  // already generated the same lease/period (the partial unique
  // (leaseId, period) index is the idempotency backstop): count them as
  // skipped. Any other bulk error is rethrown.
  const INSERT_CHUNK_SIZE = 200;
  let created = 0;
  let skippedCount = skipped.length;
  for (let i = 0; i < toCreate.length; i += INSERT_CHUNK_SIZE) {
    const chunk = toCreate.slice(i, i + INSERT_CHUNK_SIZE);
    try {
      const inserted = await Invoice.insertMany(chunk, { ordered: false });
      created += inserted.length;
    } catch (error) {
      const failure = error as {
        writeErrors?: Array<{ code?: number }>;
        insertedDocs?: unknown[];
      };
      const writeErrors = failure.writeErrors;
      if (!Array.isArray(writeErrors)) throw error;
      if (writeErrors.some((writeError) => writeError.code !== 11000)) throw error;
      created += failure.insertedDocs?.length ?? chunk.length - writeErrors.length;
      skippedCount += writeErrors.length;
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
