import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isDuplicateKeyError, readJsonBody, resolveInvoiceActor } from "@/app/api/v1/_helpers";
import { generateForPeriod } from "@/lib/invoice-generation";
import { nextInvoiceNumber } from "@/lib/invoice-numbering";
import { currentPeriod } from "@/lib/invoicing";
import { connectToDatabase } from "@/lib/mongoose";
import { requirePermission } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { invoiceGenerateInput } from "@/lib/schemas";
import { Invoice } from "@/models/Invoice";
import { Lease } from "@/models/Lease";

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
  if (actor.role === "caretaker") {
    filter.propertyId = { $in: actor.assignedPropertyIds };
    filter.ownerId = actor.managedByOwnerId;
  }

  const leases = await Lease.find(filter).lean();
  const leaseIds = leases.map((lease) => String(lease._id));
  const existing = await Invoice.find({ leaseId: { $in: leaseIds }, period })
    .select("leaseId")
    .lean();

  const { toCreate, skipped } = generateForPeriod({ leases, existing, period, now });

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
