import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AllocationError, allocateUnit, vacateUnit } from "@/lib/allocation";
import { connectToDatabase } from "@/lib/mongoose";
import { notifyMoveRequestDecided } from "@/lib/notifications";
import { authenticate, requirePermission } from "@/lib/permissions";
import { moveRequestDecisionInput } from "@/lib/schemas/move-request";
import { MoveRequest } from "@/models/MoveRequest";

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

  // Apply occupancy/lease effects on the first transition into "approved",
  // before persisting the decision so a failed allocation does not record a
  // decision whose effects never ran.
  if (parsed.data.status === "approved" && previousStatus !== "approved") {
    try {
      if (moveRequest.type === "move-in") {
        if (!moveRequest.tenantId || !moveRequest.unitId) {
          return NextResponse.json(
            { error: "Move-in request is missing a tenant or unit" },
            { status: 422 },
          );
        }
        await allocateUnit({
          tenantId: String(moveRequest.tenantId),
          unitId: String(moveRequest.unitId),
        });
      } else if (moveRequest.type === "move-out") {
        if (moveRequest.tenantId) {
          await vacateUnit({ tenantId: String(moveRequest.tenantId) });
        }
      }
    } catch (error) {
      if (error instanceof AllocationError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
  }

  moveRequest.status = parsed.data.status;
  moveRequest.decisionNote = parsed.data.decisionNote ?? "";
  moveRequest.decidedById = actor?.userId ?? "";
  moveRequest.decidedAt = new Date();
  await moveRequest.save();

  if (previousStatus !== moveRequest.status) {
    await notifyMoveRequestDecided(moveRequest);
  }

  return NextResponse.json({ data: moveRequest.toObject() });
}
