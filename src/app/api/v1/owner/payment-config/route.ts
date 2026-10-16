import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readJsonBody, resolveInvoiceActor } from "@/app/api/v1/_helpers";
import { getOwnerPaymentConfigView, saveOwnerPaymentConfig } from "@/lib/payments/owner-config";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { ownerPaymentConfigInput } from "@/lib/schemas";

/**
 * GET/PUT /api/v1/owner/payment-config
 *
 * Owner-scoped payment configuration. GET returns a masked view (never the
 * Daraja secrets) plus the resolved availability of each payment method. PUT
 * upserts the config, encrypting secrets at rest.
 */

async function resolveOwner(request: NextRequest) {
  const actor = await resolveInvoiceActor(request);
  if (actor instanceof NextResponse) return actor;
  if (actor.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return actor;
}

export async function GET(request: NextRequest) {
  const owner = await resolveOwner(request);
  if (owner instanceof NextResponse) return owner;

  const data = await getOwnerPaymentConfigView(owner.userId);
  return NextResponse.json({ data });
}

export async function PUT(request: NextRequest) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 20 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const owner = await resolveOwner(request);
  if (owner instanceof NextResponse) return owner;

  const body = await readJsonBody(request);
  const parsed = ownerPaymentConfigInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payment config payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = await saveOwnerPaymentConfig(owner.userId, parsed.data);
  return NextResponse.json({ data });
}
