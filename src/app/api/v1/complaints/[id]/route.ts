import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { propertyTitleMap, readJsonBody, resolveDashboardActor } from "@/app/api/v1/_helpers";
import { serializeComplaint } from "@/lib/complaints";
import { connectToDatabase } from "@/lib/mongoose";
import { requirePermission } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { complaintUpdate } from "@/lib/schemas";
import { Complaint } from "@/models/Complaint";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 20 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid complaint id" }, { status: 400 });
  }

  await connectToDatabase();
  const complaint = await Complaint.findById(id).lean();
  if (!complaint) {
    return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
  }

  const authError = await requirePermission(request, "complaint:manage", { resource: complaint });
  if (authError) return authError;

  const actor = await resolveDashboardActor(request);
  if (actor instanceof NextResponse) return actor;

  if (actor.role === "caretaker" && !actor.assignedPropertyIds.includes(complaint.propertyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await readJsonBody(request);
  const parsed = complaintUpdate.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid complaint payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updateData: Record<string, unknown> = {
    updatedById: actor.userId,
    updatedByRole: actor.role,
  };
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.resolution !== undefined) updateData.resolution = parsed.data.resolution;

  // The update filter is re-scoped to the permission-checked fields so a
  // concurrent re-scoping (ownership/tenancy change) between the check above
  // and this write can never widen the write to a row the actor no longer owns.
  const updated = await Complaint.findOneAndUpdate(
    {
      _id: id,
      ownerId: complaint.ownerId,
      propertyId: complaint.propertyId,
      tenantId: complaint.tenantId,
    },
    updateData,
    {
      new: true,
      runValidators: true,
    },
  ).lean();
  if (!updated) {
    return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
  }
  const titles = await propertyTitleMap([updated.propertyId]);

  console.info(
    `[complaints] update-status actor=${actor.userId} role=${actor.role} complaint=${id}`,
  );

  return NextResponse.json({ data: serializeComplaint(updated, titles) });
}
