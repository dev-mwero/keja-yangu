import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { recordProvisionalTouch } from "@/lib/attributions";
import { rateLimit } from "@/lib/rate-limit";

const touchInput = z.object({
  shareCode: z.string().trim().min(1).max(64),
  unitId: z.string().trim().min(1),
});

export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 60 });
  if (limit instanceof NextResponse) return limit;

  const body = await request.json().catch(() => null);
  const parsed = touchInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid touch payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await recordProvisionalTouch(parsed.data.shareCode, parsed.data.unitId);

  return NextResponse.json({
    data: {
      valid: result.valid,
      reason: result.reason,
      source: result.source,
      touchToken: result.touchToken,
      expiresAt: result.expiresAt,
      listingId: result.listing?._id ? String(result.listing._id) : undefined,
      propertyId: result.listing?.propertyId,
      brokerUserId: result.brokerUserId,
      commissionAgreementId: result.commissionAgreementId,
    },
  });
}
