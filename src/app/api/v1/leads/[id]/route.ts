import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate, requirePermission } from "@/lib/permissions";
import { Lead } from "@/models/Lead";
import { Tenant } from "@/models/Tenant";
import { User } from "@/models/User";

const decideInput = z.object({
  status: z.enum(["contacted", "approved", "rejected", "converted"]),
});

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.string().min(1).safeParse(id).success) {
    return NextResponse.json({ error: "Lead id is required" }, { status: 400 });
  }

  const authError = await requirePermission(request, "lead:read");
  if (authError) return authError;

  await connectToDatabase();
  const authUser = authenticate(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await User.findById(authUser.userId).select("role isActive managedByOwnerId").lean();
  if (!user?.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const filter: Record<string, unknown> = { _id: id };
  if (user.role === "owner") {
    filter.ownerId = authUser.userId;
  } else if (user.role === "custodian") {
    if (!user.managedByOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    filter.ownerId = user.managedByOwnerId;
  } else if (user.role === "system-admin") {
    // no owner filter
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lead = await Lead.findOne(filter).lean();
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  return NextResponse.json({ data: lead });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.string().min(1).safeParse(id).success) {
    return NextResponse.json({ error: "Lead id is required" }, { status: 400 });
  }

  const authError = await requirePermission(request, "lead:manage");
  if (authError) return authError;

  const body = await request.json();
  const parsed = decideInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid lead decision", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectToDatabase();
  const authUser = authenticate(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await User.findById(authUser.userId).select("role isActive managedByOwnerId").lean();
  if (!user?.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const filter: Record<string, unknown> = { _id: id };
  if (user.role === "owner") {
    filter.ownerId = authUser.userId;
  } else if (user.role === "custodian") {
    if (!user.managedByOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    filter.ownerId = user.managedByOwnerId;
  } else if (user.role === "caretaker") {
    if (!user.managedByOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    filter.ownerId = user.managedByOwnerId;
  } else if (user.role === "system-admin") {
    // no owner filter
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lead = await Lead.findOne(filter).lean();
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const nextStatus = parsed.data.status;

  // Valid transitions: new -> contacted -> approved/rejected; approved -> converted.
  const allowed: Record<string, string[]> = {
    new: ["contacted"],
    contacted: ["approved", "rejected"],
    approved: ["converted"],
  };
  if (!allowed[lead.status]?.includes(nextStatus)) {
    return NextResponse.json(
      { error: `Cannot move lead from "${lead.status}" to "${nextStatus}"` },
      { status: 409 },
    );
  }

  const update: Record<string, unknown> = { status: nextStatus };
  let convertedTenantId: string | undefined;

  if (nextStatus === "converted") {
    // Graduate the lead to a Tenant row. No User account is created here —
    // the person signs in later via the existing invite/link flow.
    const convertedTenant = await Tenant.create({
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      propertyId: lead.propertyId,
      ownerId: lead.ownerId,
      type: "residential",
      status: "active",
      userId: "",
      joinedAt: new Date(),
      notes: lead.notes
        ? `Converted from lead ${String(lead._id)}. ${lead.notes}`
        : `Converted from lead ${String(lead._id)}`,
    });
    update.convertedAt = new Date();
    update.convertedTenantId = String(convertedTenant._id);
    convertedTenantId = String(convertedTenant._id);
  }

  const updated = await Lead.findOneAndUpdate(filter, update, { new: true }).lean();
  if (!updated) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  return NextResponse.json({
    data: updated,
    ...(convertedTenantId ? { convertedTenantId } : {}),
  });
}
