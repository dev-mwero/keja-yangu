import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AllocationError, allocateUnit } from "@/lib/allocation";
import { connectToDatabase } from "@/lib/mongoose";
import { asSoftDeleteModel } from "@/lib/mongoose-soft-delete";
import { authenticate, requirePermission } from "@/lib/permissions";
import { applicationDecisionInput } from "@/lib/schemas/application";
import { Application } from "@/models/Application";
import { Tenant } from "@/models/Tenant";
import { User } from "@/models/User";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  const auth = authenticate(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();
  const application = await Application.findById(id);
  if (!application) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const authError = await requirePermission(request, "application:manage", {
    resource: { ownerId: application.ownerId },
  });
  if (authError) return authError;

  const body = await request.json();
  const parsed = applicationDecisionInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid decision payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const previousStatus = application.status;
  const isFirstApproval = parsed.data.status === "approved" && previousStatus !== "approved";

  if (isFirstApproval) {
    // Approving admits the applicant as a tenant, then (when the application
    // carries a unit) occupies that unit and opens the lease in one request.
    // Both steps run before the decision is written: a failed allocation leaves
    // the application pending so the manager can pick another unit.
    const tenantId = await admitApprovedApplicant(application);

    if (application.unitId) {
      try {
        await allocateUnit({ tenantId, unitId: String(application.unitId) });
      } catch (error) {
        if (error instanceof AllocationError) {
          return NextResponse.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }
    }
  }

  // Persist the decision last.
  application.status = parsed.data.status;
  application.decisionNote = parsed.data.decisionNote ?? "";
  application.decidedById = auth.userId;
  application.decidedAt = new Date();
  await application.save();

  return NextResponse.json({ data: application.toObject() });
}

/**
 * Create or bind the Tenant record for an approved application. Idempotent:
 * finds an existing tenancy by `{propertyId,email}` and heals its `userId`
 * binding instead of creating a duplicate. Returns the tenant's `_id` so the
 * caller can immediately allocate a unit to it.
 */
async function admitApprovedApplicant(application: {
  propertyId: string;
  ownerId: string;
  applicantUserId: string;
  applicantName: string;
  applicantEmail: string;
}): Promise<string> {
  const email = application.applicantEmail.trim().toLowerCase();
  const existing = await Tenant.findOne({
    propertyId: application.propertyId,
    email,
  }).lean();

  if (existing) {
    await Tenant.updateOne(
      { _id: existing._id },
      {
        $set: {
          userId: application.applicantUserId,
          status: "active",
          ownerId: application.ownerId,
        },
      },
    );
    return String(existing._id);
  }

  const created = await Tenant.create({
    name: application.applicantName,
    email,
    propertyId: application.propertyId,
    ownerId: application.ownerId,
    status: "active",
    userId: application.applicantUserId,
    joinedAt: new Date(),
  });
  return String(created._id);
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  const auth = authenticate(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role isActive").lean();
  if (!user?.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const application = await Application.findById(id).select("applicantUserId status").lean();
  if (!application) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (user.role !== "tenant" || application.applicantUserId !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (application.status !== "pending") {
    return NextResponse.json(
      { error: "Only a pending application can be withdrawn" },
      { status: 400 },
    );
  }

  await asSoftDeleteModel(Application).softDeleteById(id);
  return NextResponse.json({ data: { _id: id } });
}
