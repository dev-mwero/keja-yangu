/**
 * System-admin property claim review — Phase 2 Canonical Inventory
 *
 * PATCH /api/v1/admin/property-claims/[claimId]
 *   System-admin approves or rejects a pending property claim.
 *
 *   On approval:
 *   - Sets claim status → "approved"
 *   - Creates a property-scoped ManagementAssignment for the claimant
 *
 *   On rejection:
 *   - Sets claim status → "rejected"
 *   - No assignment created
 */

import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate } from "@/lib/permissions";
import { ManagementAssignment } from "@/models/ManagementAssignment";
import { PropertyClaim } from "@/models/PropertyClaim";
import { User } from "@/models/User";

/** Full permission set granted to an admin whose claim is approved. */
const CLAIM_APPROVED_PERMISSIONS = [
  "property:read",
  "property:claim",
  "property:edit",
  "unit:read",
  "unit:manage",
  "custodian:manage",
  "tenant:manage",
  "move-request:create",
  "move-request:manage",
  "application:manage",
  "lease:manage",
  "invoice:read",
  "invoice:manage",
  "invoice:mark-paid",
  "invoice:generate",
  "lead:manage",
  "lead:read",
  "notification:read-own",
  "notification:manage",
  "settings:read",
  "settings:write",
  "complaint:read-own",
  "complaint:create",
  "complaint:manage",
  "chat:read-own",
  "chat:send",
  "chat:manage",
  "announcement:read",
  "announcement:manage",
  "document:read-own",
  "document:manage",
  "assignment:read",
  "assignment:grant",
  "assignment:revoke",
  "ownership:read",
  "audit:read",
];

const reviewInput = z.object({
  decision: z.enum(["approved", "rejected"]),
  decisionNote: z.string().trim().optional().default(""),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ claimId?: string; id?: string }> },
) {
  const params = await context.params;
  const claimId = params.claimId ?? params.id ?? "";
  if (!isValidObjectId(claimId)) {
    return NextResponse.json({ error: "Invalid claim id" }, { status: 400 });
  }

  await connectToDatabase();

  const authUser = authenticate(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reviewer = await User.findById(authUser.userId).select("role isActive").lean();
  if (!reviewer?.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (reviewer.role !== "system-admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const claim = await PropertyClaim.findById(claimId);
  if (!claim) {
    return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  }

  if (claim.status !== "pending") {
    return NextResponse.json({ error: `Claim is already ${claim.status}` }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const parsed = reviewInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const now = new Date();
  claim.status = parsed.data.decision;
  claim.reviewedByUserId = authUser.userId;
  claim.reviewedAt = now;
  claim.decisionNote = parsed.data.decisionNote;
  await claim.save();

  if (parsed.data.decision === "approved") {
    // Create a property-scoped ManagementAssignment for the claimant.
    // Use upsert so a repeated approval is idempotent.
    await ManagementAssignment.findOneAndUpdate(
      {
        principalUserId: claim.claimantUserId,
        accessRole: "admin",
        scopeType: "property",
        propertyId: claim.propertyId,
        blockId: "",
        unitId: "",
        status: "active",
      },
      {
        $setOnInsert: {
          principalUserId: claim.claimantUserId,
          accessRole: "admin",
          scopeType: "property",
          propertyId: claim.propertyId,
          blockId: "",
          unitId: "",
          permissions: CLAIM_APPROVED_PERMISSIONS,
          status: "active",
          grantedByUserId: authUser.userId,
          grantedAt: now,
          source: "claim",
        },
      },
      { upsert: true, new: true },
    );
  }

  return NextResponse.json({ data: claim });
}
