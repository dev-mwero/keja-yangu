import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate, requirePermission } from "@/lib/permissions";
import { moveRequestDecisionInput } from "@/lib/schemas/move-request";
import { Lease } from "@/models/Lease";
import { MoveRequest } from "@/models/MoveRequest";
import { Property } from "@/models/Property";
import { Tenant } from "@/models/Tenant";
import { Unit } from "@/models/Unit";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  await connectToDatabase();
  const moveRequest = await MoveRequest.findById(id);
  if (!moveRequest) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const authError = await requirePermission(request, "move-request:manage", {
    resource: { ownerId: moveRequest.ownerId },
  });
  if (authError) return authError;

  const body = await request.json();
  const parsed = moveRequestDecisionInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid decision payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const actor = authenticate(request);
  const previousStatus = moveRequest.status;

  moveRequest.status = parsed.data.status;
  moveRequest.decisionNote = parsed.data.decisionNote ?? "";
  moveRequest.decidedById = actor?.userId ?? "";
  moveRequest.decidedAt = new Date();
  await moveRequest.save();

  // Only apply occupancy/lease effects on the first transition into "approved".
  if (parsed.data.status === "approved" && previousStatus !== "approved") {
    if (moveRequest.type === "move-in") {
      await applyMoveIn(moveRequest);
    } else if (moveRequest.type === "move-out") {
      await applyMoveOut(moveRequest);
    }
  }

  return NextResponse.json({ data: moveRequest.toObject() });
}

/** Approving a move-in occupies the unit and opens an active lease. */
async function applyMoveIn(moveRequest: {
  unitId: string;
  propertyId: string;
  ownerId: string;
  tenantId: string;
  requestedById: string;
}) {
  const unit = moveRequest.unitId ? await Unit.findById(moveRequest.unitId) : null;
  const occupantUserId = moveRequest.requestedById;

  if (unit) {
    unit.tenantId = occupantUserId;
    unit.status = "occupied";
    await unit.save();
  }

  if (moveRequest.tenantId) {
    // Bind the tenant record to the property and mark it active.
    await Tenant.updateOne(
      { _id: moveRequest.tenantId },
      { $set: { propertyId: moveRequest.propertyId, status: "active" } },
    );

    const property = await Property.findById(moveRequest.propertyId).select("price").lean();
    const unitRent = unit?.rent ?? null;
    const rentAmount = unitRent ?? property?.price ?? 0;

    const existingLease = await Lease.findOne({
      tenantId: moveRequest.tenantId,
      status: "active",
    }).lean();

    if (!existingLease) {
      await Lease.create({
        tenantId: moveRequest.tenantId,
        propertyId: moveRequest.propertyId,
        ownerId: moveRequest.ownerId,
        rentAmount,
        frequency: "monthly",
        startDate: new Date(),
        status: "active",
      });
    }
  }
}

/** Approving a move-out frees the unit and ends the active lease. */
async function applyMoveOut(moveRequest: {
  unitId: string;
  tenantId: string;
  requestedById: string;
}) {
  if (moveRequest.unitId) {
    const unit = await Unit.findById(moveRequest.unitId);
    if (unit && (!unit.tenantId || unit.tenantId === moveRequest.requestedById)) {
      unit.tenantId = "";
      unit.status = "available";
      await unit.save();
    }
  }

  if (moveRequest.tenantId) {
    await Lease.updateMany(
      { tenantId: moveRequest.tenantId, status: "active" },
      { $set: { status: "ended", endDate: new Date() } },
    );
  }
}
